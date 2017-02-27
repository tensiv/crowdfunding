module.exports = function(deployer) {
  deployer.deploy(FundingHub);
  deployer.autolink();
  deployer.deploy(Project);
};