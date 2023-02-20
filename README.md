# CRC Relayer

<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>

## Description

CRC Relayer node that handles Light Client Optimistic/Finality updates, requests ZKPs from
a [CRC-Prover API](https://github.com/LimeChain/crc-prover) and updates the on-chain LightClient contract.

## Installation

```bash
$ npm install
```

## Running the app

**Prerequisite**

Populate the ENV variables

```markdown
cp example.env .env
```

**Scripts**

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## License

TODO License

### TODOs for a functioning CRC Light Client

**Step 1 (CRC-Relay):**

- [X] Make it so that `ssz` package can be used in CRC-relayer
- [X] Extend beacon service to be able to get block by ID
- [X] Add logic for preparing `LightClientUpdate` struct
    - [X] Get MerkleInclusion Proof for `ExecutionStateRoot` being part of `BeaconBlockBody`

**Step 2 (Contracts):**

- [X] Deploy the Contracts (Goerli)
    - [X] Script for computing current `ssz` `syncCommitteeRoot` <---
    - [X] Script for computing current `ssz` `syncCommitteeRootPoseidon`
    - [X] Deploy script
- [X] Commit contract changes + update tests

**Step 3 (CRC-Relay):**

- [ ] Convert `ENV` to `YAML` config
    - [ ] Add config for on-chain-light-clients: `contractAddress`, `pk`, `rpcUrl`
- [ ] Add broadcast module
    - [ ] is able to broadcast to every on-chain-lightclient the finalized header update

**Step 4 (CRC-Relay):**

- [ ] Add background job for updating the sync committee
  - [ ] Get BeaconBlockState from debug endpoint
  - [ ] Get SyncCommittee and compute `branch`
- [ ] Call prover to request sync committee commitment proof as-well
- [ ] Add `syncCommitteeRoot` and `syncCommitteeRootNodes` to `LightClientUpdate` struct or Call Sync Committee Update
  directly


**Step 5 (Deployment):**

- [ ] Fix issue with Prover docker image
- [ ] Publish docker image
- [ ] Create cheaper instance for long-lasting prover VM to run the Docker Image

**Optional:**

- [ ] Modify lodestar to pass finality updates that are received on startup initial sync