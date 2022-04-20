var DiscreetLog = artifacts.require("DiscreetLog");
var MockV3Aggregator = artifacts.require("./mock/MockV3Aggregator")

module.exports = function(deployer, network, accounts) {
  if(network === "development") {
    deployer.deploy(MockV3Aggregator, 18, 100);
  }
  deployer.deploy(DiscreetLog, accounts[0]);
};