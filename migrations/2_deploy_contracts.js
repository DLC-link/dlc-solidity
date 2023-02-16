var DLCManager = artifacts.require("DLCManager");
var MockV3Aggregator = artifacts.require("./mock/MockV3Aggregator")

module.exports = function(deployer, network, accounts) {
  if(network === "development") {
    deployer.deploy(MockV3Aggregator, 18, 100);
  }
  deployer.deploy(DLCManager, accounts[0]);
};
