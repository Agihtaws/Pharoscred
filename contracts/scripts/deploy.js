const hre = require("hardhat");

async function main() {
  const Ledger = await hre.ethers.getContractFactory("AgentCreditLedger");

  // Sanity check: confirm the factory actually carries bytecode.
  const codeLen = (Ledger.bytecode.length - 2) / 2;
  console.log(`Deploying AgentCreditLedger (${codeLen} bytes of bytecode)...`);
  if (codeLen < 100) throw new Error("Bytecode looks empty - run `npx hardhat clean && npx hardhat compile`.");

  // Pharos charges by gas_limit and its estimateGas under-reports contract
  // creation, so set an explicit, generous limit instead of relying on estimation.
  const ledger = await Ledger.deploy({ gasLimit: 3_000_000 });
  console.log("Deploy tx:", ledger.deploymentTransaction()?.hash);
  await ledger.waitForDeployment();

  const address = await ledger.getAddress();
  console.log("AgentCreditLedger deployed to:", address);
  console.log("");
  console.log("Verify with:");
  console.log(`  npx hardhat verify --network pharosAtlantic ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});