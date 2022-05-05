// Defining bytecode and abi from original contract on mainnet to ensure bytecode matches and it produces the same pair code hash

module.exports = async function ({ ethers, getNamedAccounts, deployments, getChainId }) {
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  // const sbToken = await deployments.get("SugarBounceToken");

  // const sbToken = "0x40f906e19b14100d5247686e08053c4873c66192";
  const sbToken = "0x41e279A5891CaB78cCcd72C9fdd0e4b937BcAaC0";

  await deploy('BuyCredit', {
    from: deployer,
    args: [sbToken],
    log: true,
    deterministicDeployment: false,
  })
}

module.exports.tags = ["BuyCredit", "SugarBounce"];
// module.exports.dependencies = ["SugarBounceToken"];
