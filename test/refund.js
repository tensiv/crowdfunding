'use strict';

const DEADLINE_SECS = 1
const GAS_CONTRIBUTE =  500000

contract('FundingHub', function(accounts) {
  it('should refund', () => {
      const contribs = [0, web3.toWei(0.1), web3.toWei(0.2), web3.toWei(0.3)]
      let balances = []
      return Promise.all([
        hub.contribute(project.address, {from: accounts[1], value: contribs[1], gas: GAS_CONTRIBUTE}),
        hub.contribute(project.address, {from: accounts[2], value: contribs[2], gas: GAS_CONTRIBUTE}),
        hub.contribute(project.address, {from: accounts[3], value: contribs[3], gas: GAS_CONTRIBUTE}),
      ])
      .then(txs => Promise.all(txs.map(waitMined)))
      .then(() => {
        for (let i=1; i<=4; i++)
          balances[i] = web3.eth.getBalance(accounts[i])
      })
      .then(() => new Promise(function(resolve, reject) {
        setTimeout(resolve, DEADLINE_SECS * 1000);
      }))
      .then(() => hub.contribute(project.address, {from: accounts[4], value: web3.toWei(0.4), gas: GAS_CONTRIBUTE}))
      .then(txid => waitMined(txid)) 
      .then(txid => {
        let gasUsed = web3.eth.getTransactionReceipt(txid).gasUsed || web3.eth.getTransactionReceipt(txid).cumulativeGasUsed
        assert.notEqual(gasUsed, GAS_CONTRIBUTE, 'Out of gas')
        let gasPrice = web3.eth.getTransaction(txid).gasPrice
        let actualBalances = []
        for (let i=1; i<=4; i++)
          actualBalances[i] = web3.eth.getBalance(accounts[i])

        assert.equal(balances[4].minus(actualBalances[4]).toString(), gasPrice.mul(gasUsed).toString(), 'last contribute should coming back')
        assert.equal(actualBalances[1].minus(balances[1]).toString(), contribs[1], 'account 1 refunded')
        assert.equal(actualBalances[2].minus(balances[2]).toString(), contribs[2], 'account 2 refunded')
        assert.equal(actualBalances[3].minus(balances[3]).toString(), contribs[3], 'account 3 refunded')
        assert.equal(web3.eth.getBalance(project.address).toNumber(), 0, 'project balance')
      })
      .then(() => project.status.call())
      .then(status => assert.equal(status.toNumber(), 2, 'status refunded'))
    })
  })
