const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentCreditLedger", function () {
  let ledger, payer, provider, outsider;

  // Build the two EIP-712 signatures for a Settlement.
  async function signSettlement(value) {
    const domain = {
      name: "PharosCred",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await ledger.getAddress(),
    };
    const types = {
      Settlement: [
        { name: "interactionId", type: "bytes32" },
        { name: "payer", type: "address" },
        { name: "provider", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "success", type: "bool" },
      ],
    };
    const payerSig = await payer.signTypedData(domain, types, value);
    const providerSig = await provider.signTypedData(domain, types, value);
    return { payerSig, providerSig };
  }

  beforeEach(async function () {
    [payer, provider, outsider] = await ethers.getSigners();
    const Ledger = await ethers.getContractFactory("AgentCreditLedger");
    ledger = await Ledger.deploy();
    await ledger.waitForDeployment();

    await ledger.connect(payer).registerAgent("Payer Agent");
    await ledger.connect(provider).registerAgent("Provider Agent");
  });

  it("records a mutually-signed settlement and updates both parties", async function () {
    const value = {
      interactionId: ethers.id("job-1"),
      payer: payer.address,
      provider: provider.address,
      amount: 1000n,
      success: true,
    };
    const { payerSig, providerSig } = await signSettlement(value);

    await expect(
      ledger.recordSettlement(
        value.interactionId,
        value.payer,
        value.provider,
        value.amount,
        value.success,
        payerSig,
        providerSig
      )
    ).to.emit(ledger, "SettlementRecorded");

    const provStats = await ledger.getStats(provider.address);
    expect(provStats.total).to.equal(1n);
    expect(provStats.successful).to.equal(1n);
    expect(provStats.distinctPartners).to.equal(1n);
    expect(provStats.volume).to.equal(1000n);

    expect(await ledger.getScore(provider.address)).to.be.greaterThan(0n);
  });

  it("rejects a replayed interaction id", async function () {
    const value = {
      interactionId: ethers.id("job-replay"),
      payer: payer.address,
      provider: provider.address,
      amount: 1n,
      success: true,
    };
    const { payerSig, providerSig } = await signSettlement(value);

    await ledger.recordSettlement(
      value.interactionId, value.payer, value.provider, value.amount, value.success, payerSig, providerSig
    );

    await expect(
      ledger.recordSettlement(
        value.interactionId, value.payer, value.provider, value.amount, value.success, payerSig, providerSig
      )
    ).to.be.revertedWithCustomError(ledger, "InteractionAlreadyUsed");
  });

  it("rejects self-dealing", async function () {
    const value = {
      interactionId: ethers.id("job-self"),
      payer: payer.address,
      provider: payer.address,
      amount: 1n,
      success: true,
    };
    const { payerSig, providerSig } = await signSettlement(value);

    await expect(
      ledger.recordSettlement(
        value.interactionId, value.payer, value.payer, value.amount, value.success, payerSig, providerSig
      )
    ).to.be.revertedWithCustomError(ledger, "SelfDealing");
  });

  it("rejects an unregistered party", async function () {
    const value = {
      interactionId: ethers.id("job-unreg"),
      payer: payer.address,
      provider: outsider.address, // never registered
      amount: 1n,
      success: true,
    };
    const domain = {
      name: "PharosCred",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await ledger.getAddress(),
    };
    const types = {
      Settlement: [
        { name: "interactionId", type: "bytes32" },
        { name: "payer", type: "address" },
        { name: "provider", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "success", type: "bool" },
      ],
    };
    const payerSig = await payer.signTypedData(domain, types, value);
    const providerSig = await outsider.signTypedData(domain, types, value);

    await expect(
      ledger.recordSettlement(
        value.interactionId, value.payer, value.provider, value.amount, value.success, payerSig, providerSig
      )
    ).to.be.revertedWithCustomError(ledger, "NotRegistered");
  });

  it("rejects a forged provider signature", async function () {
    const value = {
      interactionId: ethers.id("job-forge"),
      payer: payer.address,
      provider: provider.address,
      amount: 1n,
      success: true,
    };
    // payer signs correctly, but the "provider" signature is actually from an outsider
    const domain = {
      name: "PharosCred",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await ledger.getAddress(),
    };
    const types = {
      Settlement: [
        { name: "interactionId", type: "bytes32" },
        { name: "payer", type: "address" },
        { name: "provider", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "success", type: "bool" },
      ],
    };
    const payerSig = await payer.signTypedData(domain, types, value);
    const forgedSig = await outsider.signTypedData(domain, types, value);

    await expect(
      ledger.recordSettlement(
        value.interactionId, value.payer, value.provider, value.amount, value.success, payerSig, forgedSig
      )
    ).to.be.revertedWithCustomError(ledger, "InvalidProviderSignature");
  });
});
