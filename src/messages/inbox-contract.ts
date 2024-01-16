import { Injectable, Logger } from "@nestjs/common";
import { NetworkConfig } from "../configuration";
import { BigNumber, Contract, ethers } from "ethers";
import * as Inbox from "../../abis/Optimism/OptimismInbox.json";
import { Events } from "../events/events";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  BASE_GOERLI_CONFIG,
  EthereumProof,
  MPTProofsEncoder,
  OPTIMISM_GOERLI_CONFIG,
  OptimismExtractoorClient,
  OutputData,
  OptimismNetworkConfig
} from "extractoor";
import { CRCMessage, OptimismMessageMIP, OptimismOutputRootMIP } from "../models";
import { Utils } from "../utils";
import { SignerService } from "../shared/signer.service";
import { PersistenceService } from "../persistence/persistence.service";
import { MessageDTO } from "../persistence/dtos/message.dto";

// Important! `networks.rollups[].name` must match the ones here
const EXTRACTOOR_CONFIG = {
  "Base": BASE_GOERLI_CONFIG,
  "Optimism": OPTIMISM_GOERLI_CONFIG
};

@Injectable()
export class InboxContract {

  private readonly logger: Logger;
  private readonly chainId: number;
  private readonly inbox: Contract;
  private readonly chain2Extractoor = new Map<number, OptimismExtractoorClient>();
  private readonly chain2Outbox = new Map<number, string>();
  private readonly chain2Name = new Map<number, string>();

  // The position of the variable for the `outbox` array inside the `Outbox` contract
  private readonly MESSAGES_ARRAY_POSITION = 0;
  // The storage key at which messages are stored inside the `outbox` contract
  private readonly MESSAGES_ARRAY_STORAGE_KEY: BigNumber;

  constructor(
    private readonly persistence: PersistenceService,
    private readonly signerService: SignerService,
    private readonly inboxChainConfig: NetworkConfig,
    private readonly l1RpcUrl: string,
    private readonly networks: NetworkConfig[],
    private readonly eventEmitter: EventEmitter2
  ) {
    this.logger = new Logger(`${InboxContract.name}-${inboxChainConfig.name}`);
    this.chainId = inboxChainConfig.chainId;
    // Creates extractoor per source chain (excluding current chain)
    // Important! Supports only Optimism based networks
    networks.filter(network => network.chainId != this.chainId).forEach(n => {
      const extractoorNetwork: OptimismNetworkConfig = {
          L2WithdrawalContractAddress: n.outgoing.l2WithdrawalContract,
          OutputOracleAddress: n.outgoing.l1RollupContract,
          OutputOracleL2OutputPosition: 3
      };
      this.logger.debug(`Extractor - ${n.name}: `);
      this.logger.debug(`\t RPC: ${n.rpcUrl}`);
      this.logger.debug(`\t L1RPC: ${l1RpcUrl}`);
      this.logger.debug(`\t L1OutputContract: ${extractoorNetwork.OutputOracleAddress}`);
      this.logger.debug(`\t L2WithdrawContract: ${extractoorNetwork.L2WithdrawalContractAddress}`);

      const extractoor = new OptimismExtractoorClient(n.rpcUrl, l1RpcUrl, extractoorNetwork);
      this.chain2Extractoor.set(n.chainId, extractoor);
      this.chain2Outbox.set(n.chainId, n.outgoing.outboxContract);
      this.chain2Name.set(n.chainId, n.name);
    });
    this.MESSAGES_ARRAY_STORAGE_KEY = Utils.computeStorageKey(this.MESSAGES_ARRAY_POSITION);

    // Initialise inbox contract instance
    const signer = signerService.getManagedSignerFor(inboxChainConfig.privateKey, inboxChainConfig.rpcUrl);
    this.inbox = new ethers.Contract(inboxChainConfig.incoming.inboxContract, Inbox, signer);

    // Subscribe to new Light Client head updates
    this.eventEmitter.on(Events.LIGHT_CLIENT_NEW_HEAD, this.onNewLightClientUpdate.bind(this));
    this.eventEmitter.on(Events.LIGHT_CLIENT_INITIALISED, this.onLightClientInitialised.bind(this));
    this.inbox.on("MessageReceived", this.onMessageReceived.bind(this));
    this.logger.log(`Instantiated contract at ${this.inbox.address}`);
  }

  async onLightClientInitialised(lightClientStates) {
    const payload = lightClientStates.filter(p => p.chainId == this.chainId)[0];
    const messages: MessageDTO[] = await this.persistence.getReadyUndeliveredMessages(payload.chainId, payload.blockNumber);
    if (messages.length > 0) {
      this.logger.log(`Found [${messages.length}] message(s) ready for processing on init`);
      await this.processMessages(messages, payload.blockNumber);
    } else {
      this.logger.log(`No messages were found ready for processing on init`);
    }
  }

  /**
   * Called once `LIGHT_CLIENT_NEW_HEAD` NodeJs event is emitted by LightClient Listeners
   * If `chainId` is corresponding to the Inbox contract chain, messages ready for submission are processed
   * @param payload
   */
  async onNewLightClientUpdate(payload: Events.HeadUpdate) {
    // LC Update is not for the Inbox contract chain
    if (payload.chainId != this.chainId) {
      return;
    }
    const messages: MessageDTO[] = await this.persistence.getReadyUndeliveredMessages(this.chainId, payload.blockNumber);
    if (messages.length > 0) {
      this.logger.log(`Light Client head updated to L1 Block [${payload.blockNumber}]. Found [${messages.length}] message(s) for processing`);
      await Promise.all([
        this.processMessages(messages, payload.blockNumber),
        this.processStateRelayFee(messages, payload.transactionCost)
      ]);
    } else {
      this.logger.log(`Light Client updated to L1 Block [${payload.blockNumber}]. No messages found for processing`);
    }
  }

  private async processMessages(messages: MessageDTO[], blockNumber: number) {
    this.logger.debug("processMessages - 1");
    // Group messages by source chain
    const messagesMap = messages.reduce((acc, msg) => {
      const messagesForChain = acc.get(msg.sourceChainId) || [];
      messagesForChain.push(msg);
      acc.set(msg.sourceChainId, messagesForChain);
      return acc;
    }, new Map<number, MessageDTO[]>());
    this.logger.debug("processMessages - 2");
    const messageGroupsPerChain = Array.from(messagesMap.entries());
    this.logger.debug(`messageGroupsPerChain.length: ${messageGroupsPerChain.length}`);
    // Process messages per chain in parallel
    await Promise.all(messageGroupsPerChain.map(async ([chain, messages]) => {
      const extractoor = this.chain2Extractoor.get(chain);
      this.logger.debug(`Start to generate latest output data, chain id: ${chain}`);
      const rollupStateProofData = await extractoor.generateLatestOutputData(ethers.utils.hexlify(blockNumber));
      this.logger.debug(`Generate latest output data - done`);
      // Processing of messages for a given chain in parallel
      await Promise.all(messages.map(msg => this.processMessage.bind(this)(extractoor, rollupStateProofData, msg)));
    }));
    this.logger.debug("processMessages - 3");
  }

  private async processStateRelayFee(messages: MessageDTO[], transactionCost: ethers.BigNumber) {
    const costPerMsg = transactionCost.div(messages.length);
    await this.populateStateRelayCost(messages, costPerMsg.toString());
  }

  /**
   * Processes a single message by preparing and sending `inboxContract.receiveMessage` function
   * @param extractoor
   * @param rollupStateProofData
   * @param message
   */
  async processMessage(extractoor: OptimismExtractoorClient, rollupStateProofData: OutputData, message: MessageDTO) {
    this.logger.debug("processMessage - 1");
    // Compute storage slot of the message inside the outbox contract in `source` rollup
    const messageStorageSlot = ethers.utils.hexlify(this.MESSAGES_ARRAY_STORAGE_KEY.add(message.index));
    this.logger.debug("processMessage - 2");

    const outboxAddress = this.chain2Outbox.get(message.sourceChainId);
    this.logger.debug("processMessage - 3");
    // Get state proof for the message within the outbox contract inside the source rollup
    const outboxProofData = await this.retryUntil(() => {
        this.logger.debug("processMessage - 3.1");
        this.logger.debug(`outboxAddress: ${outboxAddress}`);
        this.logger.debug(`messageStorageSlot: ${messageStorageSlot}`);
        this.logger.debug(`blockNum: ${rollupStateProofData.blockNum}`);
        let hexlifiedBlockNumber = ethers.BigNumber.from(rollupStateProofData.blockNum).toHexString();
        hexlifiedBlockNumber = hexlifiedBlockNumber.slice(2); // remove `0x`
        hexlifiedBlockNumber = hexlifiedBlockNumber.replace(/^0+/, ''); // remove leading zero digits
        hexlifiedBlockNumber = `0x${hexlifiedBlockNumber}`; // add `0x`

        this.logger.debug(`blockNumber hex: ${
          hexlifiedBlockNumber
        }`);
        
        return extractoor.optimism.getProof(
          outboxAddress,
          messageStorageSlot,
          hexlifiedBlockNumber
        );
      }, (result: EthereumProof) => {
        this.logger.debug("processMessage - 3.2");
        return ethers.BigNumber.from(result.storageProof[0].value).toHexString() != message.hash;
      }
    );
    this.logger.debug("processMessage - 4");

    // Prepare the calldata
    const inclusionProof = MPTProofsEncoder.rlpEncodeProofs(
      [
        outboxProofData.accountProof,
        outboxProofData.storageProof[0].proof
      ]);
      this.logger.debug("processMessage - 5");

    const envelope = {
      message: CRCMessage.fromDTO(message),
      sender: message.sender
    };
    this.logger.debug("processMessage - 6");
    const outputProof: OptimismOutputRootMIP = {
      outputRootProof: {
        stateRoot: rollupStateProofData.optimismStateRoot,
        withdrawalStorageRoot: rollupStateProofData.withdrawalStorageRoot,
        latestBlockhash: rollupStateProofData.blockHash
      },
      optimismStateProofsBlob: rollupStateProofData.outputRootRLPProof
    };
    const mptInclusionProof: OptimismMessageMIP = {
      target: outboxAddress,
      slotPosition: messageStorageSlot,
      proofsBlob: inclusionProof
    };

    // this.logger.debug(`Contract params ==========>`);
    // this.logger.debug(`envelope:`);
    // console.log(envelope);
    // this.logger.debug(`l1BlockNumber: ${ethers.BigNumber.from(rollupStateProofData.l1BlockNumber)}`);
    // this.logger.debug(`outputIndex: ${ethers.BigNumber.from(rollupStateProofData.outputIndex)}`);
    // this.logger.log(`outputProof:`);
    // console.log(JSON.stringify(outputProof));
    // this.logger.debug(`mptInclusionProof:`);
    // console.log(mptInclusionProof);
    
    try {
      this.logger.debug("processMessage - 7");
      const transaction = await this.inbox.receiveMessage(
        envelope,
        ethers.BigNumber.from(rollupStateProofData.l1BlockNumber),
        ethers.BigNumber.from(rollupStateProofData.outputIndex),
        outputProof,
        mptInclusionProof
      );
      this.logger.log(`Submitted delivery of message. {from =[${this.chain2Name.get(message.sourceChainId)}] msgHash=[${message.hash}] txHash=[${transaction.hash}] }`);
    } catch (e) {
      this.logger.log(`Transaction for delivery of message will fail. {from=[${this.chain2Name.get(message.sourceChainId)}] msgHash=[${message.hash}]}. Error: ${e}`);
    }
  }

  async onMessageReceived(user: string, target: string, hash: string, eventData) {
    this.logger.log(`Message with hash [${hash}] has been processed`);
    const [block, transaction] = await Promise.all([eventData.getBlock(), eventData.getTransactionReceipt()]);
    // const txCost = transaction.l1GasUsed.mul(transaction.l1GasPrice).mul(transaction.l1FeeScalar)
    //   .add(transaction.effectiveGasPrice.mul(transaction.gasUsed));
    const n1: ethers.BigNumber = transaction.l1GasUsed.mul(transaction.l1GasPrice);
    // avoid to be underflow, some times the `l1FeeScalar` is a float
    const l1FeeScalar: ethers.BigNumber = ethers.BigNumber.from(transaction.l1FeeScalar * 1000000).div(1000000);
    const n2: ethers.BigNumber = n1.mul(l1FeeScalar);
    const n3: ethers.BigNumber = transaction.effectiveGasPrice.mul(transaction.gasUsed);
    const n4: ethers.BigNumber = n2.add(n3);
    await this.persistence.updateDelivered(hash, eventData.transactionHash, block.timestamp, n4.toString(), eventData.blockNumber);
  }

  /**
   * Executes a function until a condition is met
   * It is used as a hack since Base has an improper cache (ttl ~1sec) set for `eth_getProof`
   * Context: https://github.com/base-org/node/issues/20
   * @param func
   * @param shouldRetry
   */
  async retryUntil(func, shouldRetry) {
    const res = await func();
    if (shouldRetry(res)) {
      this.logger.debug(`Retrying call to provider in 3 sec`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return await this.retryUntil(func, shouldRetry);
    } else {
      return res;
    }
  }

  private async populateStateRelayCost(messages: MessageDTO[], costPerMsg: string) {
    const hashes = messages.map((m) => m.hash);
    const result = await this.persistence.messages.updateMany(
      { hash: { $in: hashes } },
      { $set: { stateRelayCost: costPerMsg } }
    );
    this.logger.debug(`Populated StateRelayCost for [${result.modifiedCount}] messages`);
  }
}
