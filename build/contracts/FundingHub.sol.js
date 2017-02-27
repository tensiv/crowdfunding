var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, instance, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var decodeLogs = function(logs) {
            return logs.map(function(log) {
              var logABI = C.events[log.topics[0]];

              if (logABI == null) {
                return null;
              }

              var decoder = new SolidityEvent(null, logABI, instance.address);
              return decoder.decode(log);
            }).filter(function(log) {
              return log != null;
            });
          };

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  // If they've opted into next gen, return more information.
                  if (C.next_gen == true) {
                    return accept({
                      tx: tx,
                      receipt: receipt,
                      logs: decodeLogs(receipt.logs)
                    });
                  } else {
                    return accept(tx);
                  }
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("FundingHub error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("FundingHub error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("FundingHub contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of FundingHub: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to FundingHub.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: FundingHub not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "default": {
    "abi": [
      {
        "constant": true,
        "inputs": [],
        "name": "getActiveProjects",
        "outputs": [
          {
            "name": "",
            "type": "string"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "name": "projectNames",
        "outputs": [
          {
            "name": "",
            "type": "string"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_projName",
            "type": "string"
          }
        ],
        "name": "contribute",
        "outputs": [],
        "payable": true,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "projectlist",
        "outputs": [
          {
            "name": "",
            "type": "string"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_projName",
            "type": "string"
          },
          {
            "name": "_amountNeeded",
            "type": "uint256"
          },
          {
            "name": "_deadline",
            "type": "uint256"
          }
        ],
        "name": "createProject",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [],
        "payable": false,
        "type": "constructor"
      },
      {
        "payable": true,
        "type": "fallback"
      }
    ],
    "unlinked_binary": "0x606060405234610000575b5b5b61153d8061001b6000396000f30060606040523615620000575763ffffffff60e060020a60003504166329cfce418114620000665780633d1819f714620000fa5780635c43217b14620001915780635cbe014114620001e3578063f3a6ac5f1462000277575b620000645b62000000565b565b005b346200000057620000766200029b565b604080516020808252835181830152835191928392908301918501908083838215620000bf575b805182526020831115620000bf57601f1990920191602091820191016200009d565b505050905090810190601f168015620000ec5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b34620000005762000076600435620005d9565b604080516020808252835181830152835191928392908301918501908083838215620000bf575b805182526020831115620000bf57601f1990920191602091820191016200009d565b505050905090810190601f168015620000ec5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b62000064600480803590602001908201803590602001908080601f016020809104026020016040519081016040528093929190818152602001838380828437509496506200068695505050505050565b005b346200000057620000766200075f565b604080516020808252835181830152835191928392908301918501908083838215620000bf575b805182526020831115620000bf57601f1990920191602091820191016200009d565b505050905090810190601f168015620000ec5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b34620000005762000064602460048035828101929101359035604435620007f1565b005b604080516020810190915260008082525b6002548110156200054357600160028281548110156200000057906000526020600020900160005b506040518082805460018160011615610100020316600290048015620003345780601f106200031157610100808354040283529182019162000334565b820191906000526020600020905b8154815290600101906020018083116200031f575b505091505090815260200160405180910390205442101562000539576200049560028281548110156200000057906000526020600020900160005b50805460408051602060026001851615610100026000190190941693909304601f81018490048402820184019092528181529291830182828015620003f85780601f10620003cc57610100808354040283529160200191620003f8565b820191906000526020600020905b815481529060010190602001808311620003da57829003601f168201915b505060038054604080516020601f60026000196101006001881615020190951694909404938401819004810282018101909252828152955091935091508301828280156200048a5780601f106200045e576101008083540402835291602001916200048a565b820191906000526020600020905b8154815290600101906020018083116200046c57829003601f168201915b505050505062000a78565b60039080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f10620004e257805160ff191683800117855562000512565b8280016001018555821562000512579182015b8281111562000512578251825591602001919060010190620004f5565b5b50620005369291505b808211156200053257600081556001016200051c565b5090565b50505b5b600101620002ac565b6003805460408051602060026001851615610100026000190190941693909304601f81018490048402820184019092528181529291830182828015620005cd5780601f10620005a157610100808354040283529160200191620005cd565b820191906000526020600020905b815481529060010190602001808311620005af57829003601f168201915b505050505091505b5090565b60028181548110156200000057906000526020600020900160005b508054604080516020601f6002600019610100600188161502019095169490940493840181900481028201810190925282815293508301828280156200067e5780601f1062000652576101008083540402835291602001916200067e565b820191906000526020600020905b8154815290600101906020018083116200066057829003601f168201915b505050505081565b60006000826040518082805190602001908083835b60208310620006bc5780518252601f1990920191602091820191016200069b565b51815160209384036101000a600019018019909216911617905292019485525060408051948590039091018420547f23024408000000000000000000000000000000000000000000000000000000008552600160a060020a03338116600487015291519116945084936323024408935034925060248082019260009290919082900301818588803b15620000005761235a5a03f1156200000057505050505b5050565b6003805460408051602060026001851615610100026000190190941693909304601f810184900484028201840190925281815292918301828280156200067e5780601f1062000652576101008083540402835291602001916200067e565b820191906000526020600020905b8154815290600101906020018083116200066057829003601f168201915b505050505081565b603c810242016000831515620008075762000000565b42831015620008165762000000565b8585303387866040516107878062000d8b833901808060200186600160a060020a0316600160a060020a0316815260200185600160a060020a0316600160a060020a0316815260200184815260200183815260200182810382528888828181526020019250808284378201915050975050505050505050604051809103906000f0801562000000579050806000878760405180838380828437820191505092505050908152602001604051809103902060006101000a815481600160a060020a030219169083600160a060020a0316021790555081600187876040518083838082843782019150509250505090815260200160405180910390208190555060028054806001018281815481835581811511620009b857600083815260209020620009b89181019083015b808211156200053257600081805460018160011615610100020316600290046000825580601f10620009735750620009a8565b601f016020900490600052602060002090810190620009a891905b808211156200053257600081556001016200051c565b5090565b5b505060010162000940565b5090565b5b505050916000526020600020900160005b8888909192909192509190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1062000a185782800160ff1982351617855562000a48565b8280016001018555821562000a48579182015b8281111562000a4857823582559160200191906001019062000a2b565b5b5062000a6c9291505b808211156200053257600081556001016200051c565b5090565b5050505b505050505050565b6040805160208181018352600080835283518085018552600281527f202000000000000000000000000000000000000000000000000000000000000081840152845180840186528281528551938401909552908252919262000ae09286929091869162000ae9565b90505b92915050565b60408051602081810183526000808352835180830185528190528351808301855281905283518083018552819052835180830185528190528351808301855281905283518083018552818152845192830185528183528551875189518b518d51985197988e988e988e988e988e98909792969195869501909101909101019080591062000b735750595b908082528060200260200182016040525b50935083925060009150600090505b885181101562000bf05788818151811015620000005790602001015160f860020a900460f860020a02838380600101945081518110156200000057906020010190600160f860020a031916908160001a9053505b60010162000b93565b5060005b875181101562000c515787818151811015620000005790602001015160f860020a900460f860020a02838380600101945081518110156200000057906020010190600160f860020a031916908160001a9053505b60010162000bf4565b5060005b865181101562000cb25786818151811015620000005790602001015160f860020a900460f860020a02838380600101945081518110156200000057906020010190600160f860020a031916908160001a9053505b60010162000c55565b5060005b855181101562000d135785818151811015620000005790602001015160f860020a900460f860020a02838380600101945081518110156200000057906020010190600160f860020a031916908160001a9053505b60010162000cb6565b5060005b845181101562000d745784818151811015620000005790602001015160f860020a900460f860020a02838380600101945081518110156200000057906020010190600160f860020a031916908160001a9053505b60010162000d17565b8299505b50505050505050505095945050505050560060606040526009805460ff191690553461000057604051610787380380610787833981016040908152815160208301519183015160608401516080850151929094019390915b60c06040519081016040528086815260200184600160a060020a0316815260200183815260200182815260200160008152602001600181525060016000820151816000019080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f106100d257805160ff19168380011785556100ff565b828001600101855582156100ff579182015b828111156100ff5782518255916020019190600101906100e4565b5b506101209291505b8082111561011c5760008155600101610108565b5090565b505060208201518160010160006101000a815481600160a060020a030219169083600160a060020a0316021790555060408201518160020155606082015181600301556080820151816004015560a0820151816005015590505060016000600086600160a060020a0316600160a060020a0316815260200190815260200160002060008201816000019080546001816001161561010002031660029004828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f106101f65780548555610232565b8280016001018555821561023257600052602060002091601f016020900482015b82811115610232578254825591600101919060010190610217565b5b506102539291505b8082111561011c5760008155600101610108565b5090565b50506001828101549082018054600160a060020a031916600160a060020a039092169190911790556002808301549082015560038083015490820155600480830154908201556005918201549101555b50505050505b6104cf806102b86000396000f300606060405236156100465763ffffffff60e060020a600035041663185b69108114610053578063230244081461011857806355448d1b1461012e578063a685b5a51461015a575b6100515b610000565b565b005b346100005761006061018c565b60408051600160a060020a0387166020820152908101859052606081018490526080810183905260a0810182905260c0808252875460026000196101006001841615020190911604908201819052819060e0820190899080156101045780601f106100d957610100808354040283529160200191610104565b820191906000526020600020905b8154815290600101906020018083116100e757829003601f168201915b505097505050505050505060405180910390f35b610051600160a060020a03600435166101ae565b005b346100005761013e6004356103b0565b60408051600160a060020a039092168252519081900360200190f35b3461000057610173600160a060020a03600435166103e0565b6040805192835260208301919091528051918290030190f35b600254600354600454600554600654600194600160a060020a03169392919086565b600060006001600301544210156102d25760035460055410156102cc57600654600114156102cc576005805434908101918290556003549093509011156102375760035460055460026006556040519190039250600160a060020a0384169083156108fc029084906000818181858888f19350505050151561022f57610000565b6102376103f9565b5b50600160a060020a038216600090815260076020526040902060088054600181018083558281838015829011610293576000838152602090206102939181019083015b8082111561028f576000815560010161027b565b5090565b5b505050916000526020600020900160005b8154600160a060020a038088166101009390930a9283029202191617905560018201558181555b5b6103a7565b600454421061036157600034111561031357604051600160a060020a038416903480156108fc02916000818181858888f19350505050151561031357610000565b5b60065460021480159061032f57506009805460ff1916905560005b15610361576009805460ff1916600117905560006006819055600160a060020a0330163111156103615761036161041c565b5b5b5b600354600554106103a75760003411156103a757604051600160a060020a038416903480156108fc02916000818181858888f1935050505015156103a757610000565b5b5b5b5b505050565b600881815481101561000057906000526020600020900160005b915054906101000a9004600160a060020a031681565b6007602052600090815260409020805460019091015482565b6006546002141561004f57600030600160a060020a031631111561004f575b5b5b565b600080805b6008548310156103a757600883815481101561000057906000526020600020900160005b9054600160a060020a036101009290920a900416600081815260076020526040808220805491519395509350849281156108fc0292818181858888f19350505050151561049157610000565b5b600190920191610421565b5b5050505600a165627a7a723058208c230d140d4a7c8b3a08e6581e671fab748727cf6ad420007a79d30c80b6663c0029a165627a7a72305820bcd43728cb2b4e420c3eaee15e54f60fb7652c8a1f83fc8b742425aee4f114160029",
    "events": {},
    "updated_at": 1488233469624,
    "links": {},
    "address": "0x1c84323d29c5ab4b0c1a27e7f4f754b5cda63e6f"
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};
    this.events          = this.prototype.events          = network.events || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "function") {
      var contract = name;

      if (contract.address == null) {
        throw new Error("Cannot link contract without an address.");
      }

      Contract.link(contract.contract_name, contract.address);

      // Merge events so this contract knows about library's events
      Object.keys(contract.events).forEach(function(topic) {
        Contract.events[topic] = contract.events[topic];
      });

      return;
    }

    if (typeof name == "object") {
      var obj = name;
      Object.keys(obj).forEach(function(name) {
        var a = obj[name];
        Contract.link(name, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "FundingHub";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.FundingHub = Contract;
  }
})();
