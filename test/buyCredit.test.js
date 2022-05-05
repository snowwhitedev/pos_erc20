const { expect } = require("chai");
const { ethers } = require("hardhat");
const sigUtil = require("eth-sig-util");

const { getBigNumber, getPaddedHexStrFromBN, getChainId, getSignatureParameters } = require("../scripts/shared/utilities");
const { Wallet } = ethers;

const SB_TOKEN_NAME = "SugarBounce";
const BUY_CREDIT_NAME = "BuyCredit";

describe("BuyCredit", function () {
  before(async function () {
    this.BuyCredit = await ethers.getContractFactory("BuyCredit");
    this.SugarBounceToken = await ethers.getContractFactory("SugarBounceToken");
    this.signers = await ethers.getSigners();

    this.alice = this.signers[0];
    this.bob = this.signers[1];
    this.todd = this.signers[2];

    this.bobPrimaryKey = Wallet.fromMnemonic(config.networks[hre.network.name].accounts.mnemonic, "m/44'/60'/0'/0/1").privateKey;

    this.sbTokenDomainType = [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" }
    ];

    this.sbTokenPermitType = [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" }
    ];

    this.domainType = [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "verifyingContract", type: "address" },
      { name: "salt", type: "bytes32" }
    ];

    this.buyCreditType = [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "salt", type: "uint256" }
    ];
  });

  beforeEach(async function () {
    this.sugarBounceToken = await this.SugarBounceToken.deploy();
    this.buyCredit = await this.BuyCredit.deploy(this.sugarBounceToken.address);

    await this.sugarBounceToken.mint(this.bob.address, getBigNumber(10000));
  });

  describe("Buy credit actions", function () {
    it("Should permit at SB token and transfer SB without gas fee", async function () {
      const bobNonce = await this.sugarBounceToken.nonces(this.bob.address);
      const permitDeadline = ~~(new Date().getTime() / 1000 + 2000);
      const amountToAllow = getBigNumber(1000000);

      const permitMsg = {
        owner: this.bob.address,
        spender: this.buyCredit.address,
        value: amountToAllow.toString(),
        nonce: bobNonce.toNumber(),
        deadline: permitDeadline
      };

      const chainId = await getChainId();

      const domainData = {
        name: SB_TOKEN_NAME,
        version: "1",
        chainId,
        verifyingContract: this.sugarBounceToken.address
      };

      const dataToSign = {
        types: {
          EIP712Domain: this.sbTokenDomainType,
          Permit: this.sbTokenPermitType
        },
        domain: domainData,
        primaryType: "Permit",
        message: permitMsg
      };

      const signature = sigUtil.signTypedMessage(new Buffer.from(this.bobPrimaryKey.slice(2), "hex"), { data: dataToSign }, "V4");
      let { r, s, v } = getSignatureParameters(signature);

      await this.buyCredit.permitSBToken(this.bob.address, amountToAllow, permitDeadline, v, r, s);

      const allowedAmount = await this.sugarBounceToken.allowance(this.bob.address, this.buyCredit.address);
      expect(allowedAmount).to.be.equal(amountToAllow);

      const amountToTransfer = getBigNumber(1000);
      const transferDeadline = ~~(new Date().getTime() / 1000 + 2000);
      const bobBuyCreditNonce = await this.buyCredit.getBuyCreditNonces(this.bob.address);

      const buyCreditMsg = {
        from: this.bob.address,
        to: this.todd.address,
        amount: amountToTransfer.toString(),
        deadline: transferDeadline,
        salt: bobBuyCreditNonce.toNumber()
      };

      const buyCreditDomainData = {
        name: BUY_CREDIT_NAME,
        version: "1",
        verifyingContract: this.buyCredit.address,
        salt: getPaddedHexStrFromBN(chainId)
      };
      const buyDataToSign = {
        types: {
          EIP712Domain: this.domainType,
          BuyCredit: this.buyCreditType
        },
        primaryType: "BuyCredit",
        domain: buyCreditDomainData,
        message: buyCreditMsg
      };

      const buySignature = sigUtil.signTypedMessage(
        new Buffer.from(this.bobPrimaryKey.slice(2), "hex"),
        { data: buyDataToSign },
        "V4"
      );
      let { r: rb, s: sb, v: vb } = getSignatureParameters(buySignature);
      await this.buyCredit.buyCredit(this.bob.address, this.todd.address, amountToTransfer, transferDeadline, vb, rb, sb);

      const transferredBalance = await this.sugarBounceToken.balanceOf(this.todd.address);
      expect(transferredBalance).to.be.equal(amountToTransfer);
    });
  });
});
