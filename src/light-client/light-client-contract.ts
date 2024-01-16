import { Contract, ethers } from "ethers";
import * as BeaconLightClientABI from "../../abis/BeaconLightClient.json";
import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { NetworkConfig } from "../configuration";
import { Events } from "../events/events";
import { Groth16Proof, LightClientUpdate } from "../models";
import { Utils } from "../utils";
import { SignerService } from "../shared/signer.service";
import { PersistenceService } from "../persistence/persistence.service";
import { LightClientUpdateDTO } from "../persistence/dtos/light-client-update.dto";

@Injectable()
export class LightClientContract {

  public readonly name;
  public readonly chainId: number;
  private readonly logger: Logger;
  private readonly lightClient: Contract;
  private readonly ethereum: ethers.providers.JsonRpcProvider;

  public head: number = 0;
  public headBlockNumber: number = 0;
  public syncCommitteePeriod: number = 0;

  constructor(
    private readonly persistence: PersistenceService,
    private readonly signerService: SignerService,
    private readonly networkConfig: NetworkConfig,
    private readonly eventEmitter: EventEmitter2,
    private readonly l1RpcUrl: string
  ) {
    this.logger = new Logger(`${LightClientContract.name}-${networkConfig.name}`);
    this.name = networkConfig.name;
    this.chainId = networkConfig.chainId;
    this.ethereum = new ethers.providers.JsonRpcProvider(l1RpcUrl);

    // Initialise Light Client instance
    const signer = this.signerService.getManagedSignerFor(networkConfig.privateKey, networkConfig.rpcUrl);
    this.lightClient = new ethers.Contract(networkConfig.outgoing.lightClientContract, BeaconLightClientABI, signer);

    // Subscribe to events
    this.eventEmitter.on(Events.LIGHT_CLIENT_HEAD_UPDATE, this.onUpdate.bind(this));
    this.eventEmitter.on(Events.LIGHT_CLIENT_SYNC_COMMITTEE_UPDATE, this.onUpdateWithSyncCommittee.bind(this));
    this.lightClient.on("HeadUpdate", this.onNewHead.bind(this));
    this.lightClient.on("SyncCommitteeUpdate", this.onNewSyncPeriod.bind(this));

    this.logger.log(`Instantiated contract at ${this.lightClient.address}`);
  }

  /**
   * Loads the `head` and `sync period`
   */
  async initialiseState() {
    const [syncCommitteePeriod, headSlot, headBlock] = await Promise.all([
      this.lightClient.latestSyncCommitteePeriod() as ethers.BigNumber,
      this.lightClient.headSlot() as ethers.BigNumber,
      this.lightClient.headBlockNumber() as ethers.BigNumber
    ]);
    this.syncCommitteePeriod = syncCommitteePeriod.toNumber();
    this.head = headSlot.toNumber();
    this.headBlockNumber = headBlock.toNumber();
    this.logger.log(`Initialised contract state. slot = ${this.head}, period = ${this.syncCommitteePeriod}`);
  }

  async onUpdate(update: LightClientUpdate) {
    this.logger.debug("On update header");
    if (this.head >= update.finalizedHeader.slot) {
      this.logger.debug(`Head update published, but slot is outdated. Skipping broadcast.`);
      return;
    }
    if (this.shouldUpdateWithSyncCommittee(update.finalizedHeader.slot)) {
      this.logger.debug(`Head update published, but waiting for Update with Sync Committee. slot = ${update.finalizedHeader.slot} period on-chain = ${this.syncCommitteePeriod}`);
      return;
    }
    try {
      this.logger.debug("Call `lightClient.update()`");
      const tx = await this.lightClient.update(update, { gasLimit: 800_000 });
      this.logger.log(`Submitted header update transaction. Hash = ${tx.hash} slot = ${update.finalizedHeader.slot}`);
      tx.wait().catch(e => {
        this.logger.error(`Failed to update header. Hash = ${tx.hash} slot = ${update.finalizedHeader.slot} Error: ${e}`);
      });
    } catch (e) {
      this.logger.error(`Transaction for header update will fail. slot=${update.finalizedHeader.slot} Error: ${e.error.reason}`);
    }
  }

  async onUpdateWithSyncCommittee(payload: { update: LightClientUpdate, nextSyncCommitteePoseidon: string, proof: Groth16Proof }) {
    this.logger.debug("On update with sync committee");
    if (this.head >= payload.update.finalizedHeader.slot) {
      this.logger.debug(`Head and Sync Committee update published, but slot is outdated. Skipping broadcast.`);
      return;
    }
    if (!this.shouldUpdateWithSyncCommittee(payload.update.finalizedHeader.slot)) {
      this.logger.debug(`Head with Sync committee published, but Sync Committee Update is not necessary. slot = ${payload.update.finalizedHeader.slot} period on-chain = ${this.syncCommitteePeriod}`);
      return;
    }
    const { update, nextSyncCommitteePoseidon, proof } = payload;
    try {
      this.logger.debug("Call `lightClient.updateWithSyncCommittee()`");
      console.log(proof);
      const tx = await this.lightClient.updateWithSyncCommittee(update, nextSyncCommitteePoseidon, proof);
      this.logger.log(`Submitted Header + Sync Committee update transaction. Hash = ${tx.hash} slot = ${update.finalizedHeader.slot}`);
      tx.wait().catch(e => {
        this.logger.error(`Failed to update Header + Sync Committee period. Hash = ${tx.hash} slot = ${update.finalizedHeader.slot} } Error: ${e}`);
      });
    } catch (e) {
      // this.logger.error(`Transaction for Header + Sync Committee update will fail. Slot=${update.finalizedHeader.slot} }. Error: ${e.error.reason}`);
      console.log(e);
    }
  }

  async onNewHead(slot: ethers.BigNumber, blockNumber: ethers.BigNumber, executionRoot: string, eventData) {
    this.logger.debug(`New head update received. slot = ${slot}, blockNumber = ${blockNumber}`);
    this.head = slot.toNumber();

    const [l1Block, l2Block, transaction] = await Promise.all([
      this.ethereum.getBlock(blockNumber.toNumber()),
      eventData.getBlock(),
      eventData.getTransactionReceipt()
    ]);

    this.logger.debug(`l1GasUsed: ${transaction.l1GasUsed}, l1GasPrice: ${transaction.l1GasPrice}, l1FeeScalar: ${transaction.l1FeeScalar}, effectiveGasPrice: ${transaction.effectiveGasPrice}, gasUsed: ${transaction.gasUsed}`);
    const n1: ethers.BigNumber = transaction.l1GasUsed.mul(transaction.l1GasPrice);
    const n2: ethers.BigNumber = n1.mul(transaction.l1FeeScalar);
    const n3: ethers.BigNumber = transaction.effectiveGasPrice.mul(transaction.gasUsed);
    const n4: ethers.BigNumber = n2.add(n3);
    this.logger.debug(`n1: ${n1}, n2: ${n2}, n3: ${n3}, n4: ${n4}`);

    this.eventEmitter.emit(Events.LIGHT_CLIENT_NEW_HEAD, {
      chainId: this.chainId,
      slot: slot.toNumber(),
      blockNumber: blockNumber.toNumber(),
      executionRoot: executionRoot,
      transactionCost: n4
    } as Events.HeadUpdate);

    const updateDTO = new LightClientUpdateDTO(
      this.chainId,
      eventData.transactionHash,
      l2Block.timestamp,
      slot.toNumber(),
      blockNumber.toNumber(),
      l1Block.timestamp,
      executionRoot
    );
    await this.persistence.lightClientUpdates.create(updateDTO);
  }

  onNewSyncPeriod(period: ethers.BigNumber, root: string) {
    this.logger.log(`New Sync Committee update received. period = ${period}`);
    this.syncCommitteePeriod = period.toNumber();
    this.eventEmitter.emit(Events.LIGHT_CLIENT_NEW_SYNC_COMMITTEE_PERIOD, {
      chainId: this.chainId,
      period: period.toNumber(),
      syncCommitteeRoot: root
    } as Events.SyncCommitteeUpdate);
  }

  shouldUpdateWithSyncCommittee(slot: number): boolean {
    return this.syncCommitteePeriod < Utils.getSyncPeriodForSlot(slot) + 1;
  }

}