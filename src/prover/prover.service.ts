import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { altair } from "@lodestar/types";
import { BeaconService } from "../beacon/beacon.service";
import { PointG1, PointG2 } from "@noble/bls12-381";
import { Utils } from "../utils";
import { BigNumber, ethers } from "ethers";
import { LightClientFinalityUpdate } from "@lodestar/types/lib/altair";

export const ROOT_BYTE_LENGTH = 32;
export const AGGREGATE_SIGNATURE_BYTE_LENGTH = 96;

@Injectable()
export class ProverService {

  private readonly baseUrl;
  private readonly proofEndpoint: string = "/api/v1/proof/generate";
  private readonly logger = new Logger(ProverService.name);
  private isZKPInProgress: boolean = false;

  constructor(private beaconService: BeaconService, private config: ConfigService) {
    this.baseUrl = this.config.get<string>("PROVER_URL");
  }

  /**
   * Returns whether the Prover service has a ZKP generation already in progress
   */
  hasCapacity(): boolean {
    return !this.isZKPInProgress;
  }

  /**
   * Does a preprocessing of the finality update in order to derive the necessary inputs for the ZKP
   * Requests a ZKP from the ProverAPI
   * @param update
   */
  async computeHeaderProof(update: altair.LightClientUpdate): Promise<Groth16Proof> {
    this.isZKPInProgress = true;

    // 1. Prepare the ZKP inputs
    const syncCommitteePubKeys = await this.beaconService.getSyncCommitteePubKeys(update.signatureSlot);
    const pubkeys = ProverService.pubKeysHex2Int(syncCommitteePubKeys);
    const pubkeybits = Utils.syncCommitteeBytes2bits(update.syncAggregate.syncCommitteeBits);
    const signature = ProverService.sig2SnarkInput(update.syncAggregate.syncCommitteeSignature);
    const signingRoot = await this.computeSigningRoot(update);
    const blsHeaderVerifyInput = {
      pubkeys,
      pubkeybits,
      signature,
      signing_root: signingRoot
    };
    // 2. Request a BLS Header Verify ZKP (takes ~3-4 minutes)
    const proof = await this.requestHeaderProof(blsHeaderVerifyInput);
    this.isZKPInProgress = false;
    return ProverService.parseProof(proof);
  }

  async computeSyncCommitteeProof(update: altair.LightClientUpdate) {

  }

  async requestSyncCommitteeProof(inputs: any) {
    return this.callProver("ssz2Poseidon", inputs);
  }

  private static parseProof(proof: any): Groth16Proof {
    const aOriginal = proof.proof['pi_a'];
    const bOriginal = proof.proof['pi_b'];
    const cOriginal = proof.proof['pi_c'];
    // The last element of `pi_a` states whether the arrays should be inverted when provided to the Smart Contract
    // If value is "0", numbers should be inverted, if value is "1", they should stay the same
    let invertA:boolean = aOriginal[2] == "0";
    let invertB0: boolean = bOriginal[2][0] == "0";
    let invertB1: boolean = bOriginal[2][1] == "0";
    let invertC: boolean = cOriginal[2] == "0";

    const a = [
      ethers.utils.hexlify(BigNumber.from(aOriginal[invertA ? 1 : 0])),
      ethers.utils.hexlify(BigNumber.from(aOriginal[invertA ? 0 : 1])),
    ];
    const b = [
      [
        ethers.utils.hexlify(BigNumber.from(bOriginal[0][invertB0 ? 1 : 0])),
        ethers.utils.hexlify(BigNumber.from(bOriginal[0][invertB0 ? 0 : 1])),
      ],
      [
        ethers.utils.hexlify(BigNumber.from(bOriginal[1][invertB1 ? 1 : 0])),
        ethers.utils.hexlify(BigNumber.from(bOriginal[1][invertB1 ? 0 : 1])),
      ]
    ]
    const c = [
      ethers.utils.hexlify(BigNumber.from(cOriginal[invertC ? 1 : 0])),
      ethers.utils.hexlify(BigNumber.from(cOriginal[invertC ? 0 : 1])),
    ]
    return {
      a,
      b,
      c
    };
  }

  private async requestHeaderProof(inputs: any) {
    return this.callProver("blsHeaderVerify", inputs);
  }

  private async callProver(circuit: string, inputs: any) {
    try {
      const response = await fetch(this.baseUrl + this.proofEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ circuit, inputs })
      });
      const result = await response.json();
      if (response.status >= 400) {
        this.logger.error(`Failed to request proof. Error ${result.error}`);
        // TODO throw
      }
      return result;
    } catch (e) {
      this.logger.error(`Failed to request proof. Error ${e.toString()}`);
    }
  }

  private static pubKeysHex2Int(pubkeys: string[]): any {
    const result = [];
    for (let i = 0; i < pubkeys.length; i++) {
      const point = PointG1.fromHex(pubkeys[i]);
      const bigInts = Utils.pointToBigInt(point);
      result.push([
        Utils.bigIntToArray(bigInts[0]),
        Utils.bigIntToArray(bigInts[1])
      ]);
    }
    return result;
  }

  private static sig2SnarkInput(signature: any): [string[][], string[][]] {
    const signaturePoint = PointG2.fromSignature(Utils.asUint8Array(signature, AGGREGATE_SIGNATURE_BYTE_LENGTH));
    signaturePoint.assertValidity();
    return [
      [
        Utils.bigIntToArray(signaturePoint.toAffine()[0].c0.value),
        Utils.bigIntToArray(signaturePoint.toAffine()[0].c1.value)
      ],
      [
        Utils.bigIntToArray(signaturePoint.toAffine()[1].c0.value),
        Utils.bigIntToArray(signaturePoint.toAffine()[1].c1.value)
      ]
    ];
  }

  private async computeSigningRoot(update: LightClientFinalityUpdate): Promise<string[]> {
    const genesisValidatorsRoot = await this.beaconService.getGenesisValidatorRoot();
    const forkVersion = await this.beaconService.getForkVersion(update.signatureSlot);
    const domain = ProverService.computeDomain(forkVersion, genesisValidatorsRoot);
    const sszAttestedHeader = ProverService.sszBeaconHeader(update.attestedHeader.beacon);
    return Utils.hexToIntArray(ethers.utils.sha256(Buffer.concat([ethers.utils.arrayify(sszAttestedHeader), domain])));
  }

  private static computeDomain(forkVersionStr: string, genesisValidatorsRootStr: string): Uint8Array {
    const forkVersion = ethers.utils.arrayify(forkVersionStr);
    const genesisValidatorRoot = ethers.utils.arrayify(genesisValidatorsRootStr);
    const right = ethers.utils.arrayify(ethers.utils.sha256(ethers.utils.defaultAbiCoder.encode(["bytes4", "bytes32"], [forkVersion, genesisValidatorRoot])));
    // SYNC_COMMITTEE_DOMAIN_TYPE https://github.com/ethereum/consensus-specs/blob/da3f5af919be4abb5a6db5a80b235deb8b4b5cba/specs/altair/beacon-chain.md#domain-types
    const domain = new Uint8Array(32);
    domain.set([7, 0, 0, 0], 0);
    domain.set(right.slice(0, 28), 4);
    return domain;
  }

  private static sszBeaconHeader(attestedHeader: any): string {
    const parentRoot = Utils.asUint8Array(attestedHeader.parentRoot, ROOT_BYTE_LENGTH);
    const bodyRoot = Utils.asUint8Array(attestedHeader.bodyRoot, ROOT_BYTE_LENGTH);
    const stateRoot = Utils.asUint8Array(attestedHeader.stateRoot, ROOT_BYTE_LENGTH);

    const left = ethers.utils.sha256(Buffer.concat([
      ethers.utils.arrayify(ethers.utils.sha256(Buffer.concat([Buffer.concat([Utils.toLittleEndian(Number(attestedHeader.slot))], 32), Buffer.concat([Utils.toLittleEndian(Number(attestedHeader.proposerIndex))], 32)]))),
      ethers.utils.arrayify(ethers.utils.sha256(Buffer.concat([ethers.utils.arrayify(parentRoot), ethers.utils.arrayify(stateRoot)])))
    ]));
    const right = ethers.utils.sha256(Buffer.concat([
      ethers.utils.arrayify(ethers.utils.sha256(Buffer.concat([ethers.utils.arrayify(bodyRoot), ethers.utils.arrayify(ethers.constants.HashZero)]))),
      ethers.utils.arrayify(ethers.utils.sha256(Buffer.concat([ethers.utils.arrayify(ethers.constants.HashZero), ethers.utils.arrayify(ethers.constants.HashZero)])))
    ]));
    return ethers.utils.sha256(Buffer.concat([ethers.utils.arrayify(left), ethers.utils.arrayify(right)]));
  }
}

export type Groth16Proof = {
  a: string[],
  b: string[][],
  c: string[]
}