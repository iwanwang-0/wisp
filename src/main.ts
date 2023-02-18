import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { getLodestarTypes } from "./lodestar-types";
import { altair } from "@lodestar/types";
import { LightClientService } from "./light-client/light-client.service";

async function bootstrap() {
  await getLodestarTypes();
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
  const lcService = app.get(LightClientService);
  await lcService.processFinalityUpdate((updateJson as unknown) as altair.LightClientUpdate);
}

bootstrap();

let updateJson = {
  "attestedHeader": {
    "beacon": {
      "slot": 5009920,
      "proposerIndex": 42858,
      "parentRoot": {
        "0": 201,
        "1": 131,
        "2": 22,
        "3": 29,
        "4": 179,
        "5": 74,
        "6": 97,
        "7": 130,
        "8": 255,
        "9": 17,
        "10": 93,
        "11": 197,
        "12": 35,
        "13": 157,
        "14": 153,
        "15": 36,
        "16": 242,
        "17": 190,
        "18": 254,
        "19": 40,
        "20": 251,
        "21": 113,
        "22": 147,
        "23": 82,
        "24": 192,
        "25": 201,
        "26": 181,
        "27": 64,
        "28": 151,
        "29": 195,
        "30": 201,
        "31": 124
      },
      "stateRoot": {
        "0": 215,
        "1": 197,
        "2": 118,
        "3": 240,
        "4": 87,
        "5": 182,
        "6": 104,
        "7": 237,
        "8": 66,
        "9": 88,
        "10": 246,
        "11": 110,
        "12": 168,
        "13": 115,
        "14": 16,
        "15": 165,
        "16": 153,
        "17": 175,
        "18": 246,
        "19": 28,
        "20": 80,
        "21": 140,
        "22": 199,
        "23": 35,
        "24": 245,
        "25": 65,
        "26": 145,
        "27": 13,
        "28": 198,
        "29": 3,
        "30": 86,
        "31": 227
      },
      "bodyRoot": {
        "0": 14,
        "1": 75,
        "2": 229,
        "3": 181,
        "4": 227,
        "5": 73,
        "6": 253,
        "7": 180,
        "8": 19,
        "9": 197,
        "10": 100,
        "11": 52,
        "12": 21,
        "13": 63,
        "14": 105,
        "15": 5,
        "16": 5,
        "17": 235,
        "18": 4,
        "19": 79,
        "20": 254,
        "21": 225,
        "22": 84,
        "23": 133,
        "24": 232,
        "25": 21,
        "26": 81,
        "27": 80,
        "28": 201,
        "29": 203,
        "30": 160,
        "31": 235
      }
    }
  },
  "finalizedHeader": {
    "beacon": {
      "slot": 5009856,
      "proposerIndex": 117504,
      "parentRoot": {
        "0": 123,
        "1": 242,
        "2": 247,
        "3": 157,
        "4": 127,
        "5": 108,
        "6": 50,
        "7": 151,
        "8": 75,
        "9": 52,
        "10": 3,
        "11": 119,
        "12": 134,
        "13": 148,
        "14": 117,
        "15": 222,
        "16": 84,
        "17": 82,
        "18": 20,
        "19": 159,
        "20": 153,
        "21": 171,
        "22": 127,
        "23": 148,
        "24": 170,
        "25": 86,
        "26": 93,
        "27": 65,
        "28": 18,
        "29": 83,
        "30": 241,
        "31": 63
      },
      "stateRoot": {
        "0": 106,
        "1": 39,
        "2": 248,
        "3": 191,
        "4": 218,
        "5": 211,
        "6": 186,
        "7": 203,
        "8": 249,
        "9": 1,
        "10": 150,
        "11": 207,
        "12": 229,
        "13": 210,
        "14": 178,
        "15": 149,
        "16": 3,
        "17": 24,
        "18": 221,
        "19": 233,
        "20": 178,
        "21": 79,
        "22": 7,
        "23": 196,
        "24": 141,
        "25": 47,
        "26": 185,
        "27": 167,
        "28": 209,
        "29": 163,
        "30": 160,
        "31": 232
      },
      "bodyRoot": {
        "0": 64,
        "1": 30,
        "2": 45,
        "3": 68,
        "4": 25,
        "5": 133,
        "6": 37,
        "7": 224,
        "8": 57,
        "9": 123,
        "10": 245,
        "11": 7,
        "12": 246,
        "13": 50,
        "14": 175,
        "15": 210,
        "16": 123,
        "17": 49,
        "18": 29,
        "19": 141,
        "20": 38,
        "21": 8,
        "22": 40,
        "23": 127,
        "24": 80,
        "25": 173,
        "26": 218,
        "27": 130,
        "28": 227,
        "29": 148,
        "30": 0,
        "31": 13
      }
    }
  },
  "finalityBranch": [
    {
      "0": 142,
      "1": 99,
      "2": 2,
      "3": 0,
      "4": 0,
      "5": 0,
      "6": 0,
      "7": 0,
      "8": 0,
      "9": 0,
      "10": 0,
      "11": 0,
      "12": 0,
      "13": 0,
      "14": 0,
      "15": 0,
      "16": 0,
      "17": 0,
      "18": 0,
      "19": 0,
      "20": 0,
      "21": 0,
      "22": 0,
      "23": 0,
      "24": 0,
      "25": 0,
      "26": 0,
      "27": 0,
      "28": 0,
      "29": 0,
      "30": 0,
      "31": 0
    },
    {
      "0": 104,
      "1": 204,
      "2": 83,
      "3": 93,
      "4": 39,
      "5": 210,
      "6": 88,
      "7": 138,
      "8": 94,
      "9": 115,
      "10": 232,
      "11": 77,
      "12": 60,
      "13": 155,
      "14": 98,
      "15": 138,
      "16": 154,
      "17": 70,
      "18": 202,
      "19": 122,
      "20": 51,
      "21": 111,
      "22": 233,
      "23": 94,
      "24": 37,
      "25": 249,
      "26": 229,
      "27": 218,
      "28": 30,
      "29": 3,
      "30": 58,
      "31": 144
    },
    {
      "0": 81,
      "1": 151,
      "2": 113,
      "3": 104,
      "4": 227,
      "5": 160,
      "6": 94,
      "7": 91,
      "8": 209,
      "9": 247,
      "10": 53,
      "11": 30,
      "12": 99,
      "13": 227,
      "14": 248,
      "15": 47,
      "16": 134,
      "17": 134,
      "18": 124,
      "19": 182,
      "20": 28,
      "21": 120,
      "22": 225,
      "23": 226,
      "24": 43,
      "25": 32,
      "26": 148,
      "27": 169,
      "28": 224,
      "29": 160,
      "30": 195,
      "31": 25
    },
    {
      "0": 121,
      "1": 247,
      "2": 163,
      "3": 243,
      "4": 10,
      "5": 99,
      "6": 15,
      "7": 24,
      "8": 235,
      "9": 3,
      "10": 226,
      "11": 119,
      "12": 209,
      "13": 18,
      "14": 201,
      "15": 100,
      "16": 102,
      "17": 82,
      "18": 171,
      "19": 110,
      "20": 213,
      "21": 166,
      "22": 78,
      "23": 123,
      "24": 160,
      "25": 83,
      "26": 186,
      "27": 249,
      "28": 160,
      "29": 134,
      "30": 9,
      "31": 193
    },
    {
      "0": 21,
      "1": 163,
      "2": 130,
      "3": 70,
      "4": 236,
      "5": 80,
      "6": 52,
      "7": 67,
      "8": 204,
      "9": 193,
      "10": 235,
      "11": 0,
      "12": 127,
      "13": 41,
      "14": 25,
      "15": 194,
      "16": 225,
      "17": 140,
      "18": 227,
      "19": 236,
      "20": 87,
      "21": 49,
      "22": 46,
      "23": 105,
      "24": 195,
      "25": 233,
      "26": 81,
      "27": 206,
      "28": 218,
      "29": 70,
      "30": 82,
      "31": 186
    },
    {
      "0": 44,
      "1": 172,
      "2": 78,
      "3": 115,
      "4": 104,
      "5": 151,
      "6": 122,
      "7": 241,
      "8": 63,
      "9": 103,
      "10": 36,
      "11": 187,
      "12": 77,
      "13": 178,
      "14": 192,
      "15": 53,
      "16": 214,
      "17": 75,
      "18": 54,
      "19": 246,
      "20": 236,
      "21": 47,
      "22": 189,
      "23": 78,
      "24": 218,
      "25": 153,
      "26": 141,
      "27": 152,
      "28": 243,
      "29": 112,
      "30": 84,
      "31": 167
    }
  ],
  "syncAggregate": {
    "syncCommitteeBits": {
      "uint8Array": {
        "0": 250,
        "1": 28,
        "2": 6,
        "3": 174,
        "4": 123,
        "5": 230,
        "6": 200,
        "7": 159,
        "8": 80,
        "9": 132,
        "10": 53,
        "11": 3,
        "12": 25,
        "13": 64,
        "14": 123,
        "15": 113,
        "16": 22,
        "17": 209,
        "18": 162,
        "19": 10,
        "20": 170,
        "21": 204,
        "22": 30,
        "23": 39,
        "24": 244,
        "25": 165,
        "26": 155,
        "27": 212,
        "28": 81,
        "29": 196,
        "30": 62,
        "31": 219,
        "32": 197,
        "33": 73,
        "34": 145,
        "35": 171,
        "36": 172,
        "37": 150,
        "38": 163,
        "39": 213,
        "40": 247,
        "41": 156,
        "42": 182,
        "43": 41,
        "44": 78,
        "45": 123,
        "46": 43,
        "47": 36,
        "48": 253,
        "49": 190,
        "50": 110,
        "51": 8,
        "52": 20,
        "53": 30,
        "54": 27,
        "55": 220,
        "56": 245,
        "57": 54,
        "58": 45,
        "59": 43,
        "60": 95,
        "61": 0,
        "62": 118,
        "63": 161
      },
      "bitLen": 512
    },
    "syncCommitteeSignature": {
      "0": 165,
      "1": 178,
      "2": 141,
      "3": 24,
      "4": 236,
      "5": 210,
      "6": 207,
      "7": 154,
      "8": 89,
      "9": 73,
      "10": 113,
      "11": 178,
      "12": 46,
      "13": 22,
      "14": 111,
      "15": 148,
      "16": 38,
      "17": 121,
      "18": 137,
      "19": 3,
      "20": 114,
      "21": 78,
      "22": 62,
      "23": 252,
      "24": 221,
      "25": 85,
      "26": 34,
      "27": 52,
      "28": 152,
      "29": 99,
      "30": 161,
      "31": 175,
      "32": 91,
      "33": 231,
      "34": 251,
      "35": 144,
      "36": 209,
      "37": 222,
      "38": 149,
      "39": 38,
      "40": 234,
      "41": 164,
      "42": 41,
      "43": 204,
      "44": 241,
      "45": 215,
      "46": 205,
      "47": 88,
      "48": 4,
      "49": 135,
      "50": 93,
      "51": 126,
      "52": 124,
      "53": 74,
      "54": 209,
      "55": 181,
      "56": 130,
      "57": 64,
      "58": 84,
      "59": 198,
      "60": 122,
      "61": 34,
      "62": 84,
      "63": 11,
      "64": 147,
      "65": 127,
      "66": 2,
      "67": 139,
      "68": 85,
      "69": 14,
      "70": 66,
      "71": 157,
      "72": 154,
      "73": 0,
      "74": 16,
      "75": 88,
      "76": 101,
      "77": 66,
      "78": 19,
      "79": 93,
      "80": 95,
      "81": 138,
      "82": 231,
      "83": 110,
      "84": 193,
      "85": 20,
      "86": 88,
      "87": 17,
      "88": 216,
      "89": 190,
      "90": 190,
      "91": 7,
      "92": 50,
      "93": 218,
      "94": 132,
      "95": 8
    }
  },
  "signatureSlot": 5009921
};