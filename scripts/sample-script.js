const fs = require("fs");
const { ethers, network } = require("hardhat");
const { BigNumber, Wallet } = ethers;
const hre = require("hardhat");
const sigUtil = require("eth-sig-util");
const { Biconomy } = require("@biconomy/mexa");
const {
  getBigNumber,
  getNumber,
  getHexStrFromStr,
  getPaddedHexStrFromBN,
  getChainId,
  getSignatureParameters,
  getPaddedHexStrFromBNArray,
  getBytes32FromStr
} = require("./shared/utilities");

const sbTokenDomainType = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" }
];

const sbTokenPermitType = [
  { name: "owner", type: "address" },
  { name: "spender", type: "address" },
  { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" }
];

const domainType = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "verifyingContract", type: "address" },
  { name: "salt", type: "bytes32" }
];

const metaTransactionType = [
  { name: "nonce", type: "uint256" },
  { name: "from", type: "address" },
  { name: "functionSignature", type: "bytes" }
];

const buyCreditType = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "amount", type: "uint256" },
  { name: "deadline", type: "uint256" }
];

const SB_TOKEN_ADDRESS = "0x41e279A5891CaB78cCcd72C9fdd0e4b937BcAaC0";
const BUY_CREDIT_ADDRESS = "0xFA2579F983B741a991AdC3beEb282434F72b49A6";

const SB_TOKEN_NAME = "SugarBounce";
const BUY_CREDIT_NAME = "BuyCredit";

async function main() {
  const buyCreditContract = await ethers.getContractAt("BuyCredit", BUY_CREDIT_ADDRESS);
  const sbTokenContract = await ethers.getContractAt("SugarBounceToken", SB_TOKEN_ADDRESS);

  const signers = await ethers.getSigners();
  const alice = signers[0];
  const bob = signers[1]; // 0xdefd29b83702cc5da21a65eed1fec2ceab768074
  const todd = signers[2];

  await (await sbTokenContract.mint(bob.address, getBigNumber(1000))).wait();

  const timestamp = ~~(new Date().getTime() / 1000);

  const alicePrivateKey = Wallet.fromMnemonic(config.networks[hre.network.name].accounts.mnemonic, "m/44'/60'/0'/0/0").privateKey;
  const bobPrivateKey = Wallet.fromMnemonic(config.networks[hre.network.name].accounts.mnemonic, "m/44'/60'/0'/0/1").privateKey;

  const jsonRpcProvider = new ethers.providers.JsonRpcProvider(hre.config.networks.bscTest.url);

  const biconomy = new Biconomy(jsonRpcProvider, { apiKey: process.env.BICONOMY_API_KEY, debug: true });
  const ethersProvider = new ethers.providers.Web3Provider(biconomy);
  let wallet = new ethers.Wallet(bobPrivateKey);

  biconomy
    .onEvent(biconomy.READY, async () => {
      console.log("biconomy ready");
    })
    .onEvent(biconomy.ERROR, (error, message) => {
      console.log("message", message);
      console.log("error", error);
    });

  const bobSBNonce = await sbTokenContract.nonces(bob.address);
  const permitDeadline = timestamp + 2000;
  const amountToAllow = getBigNumber(1000000);

  const permitMsg = {
    owner: bob.address,
    spender: buyCreditContract.address,
    value: amountToAllow.toString(),
    nonce: bobSBNonce.toNumber(),
    deadline: permitDeadline
  };

  const chainId = 97; // await getChainId()
  console.log("chainId", chainId);

  const sbTokenDomainData = {
    name: SB_TOKEN_NAME,
    version: "1",
    chainId,
    verifyingContract: sbTokenContract.address
  };

  const permitDataToSign = {
    types: {
      EIP712Domain: sbTokenDomainType,
      Permit: sbTokenPermitType
    },
    domain: sbTokenDomainData,
    primaryType: "Permit",
    message: permitMsg
  };

  const permitSignature = sigUtil.signTypedMessage(
    new Buffer.from(bobPrivateKey.slice(2), "hex"),
    { data: permitDataToSign },
    "V4"
  );
  let { r: rp, s: sp, v: vp } = getSignatureParameters(permitSignature);

  // await (await buyCreditContract.permitSBToken(bob.address, amountToAllow, permitDeadline, vp, rp, sp)).wait();

  const permitFunctionSignature = buyCreditContract.interface.encodeFunctionData("permitSBToken", [
    bob.address,
    amountToAllow,
    permitDeadline,
    vp,
    rp,
    sp
  ]);

  const buyCreditNonce = await buyCreditContract.getNonce(bob.address);

  const message = {
    nonce: buyCreditNonce.toNumber(),
    from: bob.address,
    functionSignature: permitFunctionSignature
  };

  const buyCreditDomainData = {
    name: BUY_CREDIT_NAME,
    version: "1",
    verifyingContract: buyCreditContract.address,
    salt: getPaddedHexStrFromBN(chainId)
  };

  const dataToSign = {
    types: {
      EIP712Domain: domainType,
      MetaTransaction: metaTransactionType
    },
    domain: buyCreditDomainData,
    primaryType: "MetaTransaction",
    message: message
  };

  const signature = sigUtil.signTypedMessage(new Buffer.from(bobPrivateKey.slice(2), "hex"), { data: dataToSign }, "V4");
  let { r, s, v } = getSignatureParameters(signature);

  let rawTx, tx;
  rawTx = {
    to: buyCreditContract.address,
    data: buyCreditContract.interface.encodeFunctionData("executeMetaTransaction", [
      bob.address,
      permitFunctionSignature,
      r,
      s,
      v
    ]),
    from: bob.address,
    gasLimit: 1000000
  };
  tx = await wallet.signTransaction(rawTx);

  let transactionHash;
  try {
    let receipt = await ethersProvider.sendTransaction(tx);
    console.log(receipt);
  } catch (error) {
    if (error.returnedHash && error.expectedHash) {
      console.log("Transaction hash : ", error.returnedHash);
      transactionHash = error.returnedHash;
    } else {
      console.log("[Error while sending transaction]", error);
    }
  }

  if (transactionHash) {
    let receipt = await ethersProvider.waitForTransaction(transactionHash);
    console.log(receipt);
  } else {
    console.log("Could not get transaction hash");
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
