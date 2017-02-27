var accounts;
var account;

window.onload = function() {
  web3.eth.getAccounts(function(err, accs) {
    if (err != null) {
      alert("There was an error fetching your accounts.");
      return;
    }

    if (accs.length == 0) {
      alert("Couldn't get any accounts! Make sure your Ethereum client is configured correctly.");
      return;
    }

    accounts = accs;
    account = accounts[0];

  });
}

function createProject() {
  var fundinghub = FundingHub.deployed();
  var proj_name = document.getElementById("proj_name").value
  var amount = document.getElementById("amount").value
  var deadline = document.getElementById("deadline").value
  fundinghub.createProject(proj_name, amount, deadline, {from : account , gas: 4712300}); 
}

function browseProject() {
  var fundinghub = FundingHub.deployed();
  fundinghub.getActiveProjects().then(function(r) {
    document.getElementById("proj_name_a").value = r;
  });
} 

function contributeProject() {
  var fundinghub = FundingHub.deployed();
  var proj_name = document.getElementById("proj_name_c").value
  var amount = document.getElementById("amount_c").value
  fundinghub.contribute(proj_name, { from : account, value: amount, gas: 4712300}); 
}