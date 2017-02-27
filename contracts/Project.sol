pragma solidity ^0.4.4;

contract Project {

  // project information structure
  struct ProjInfo {
    string  projName;
    address owner;
    uint256 amountNeeded;
    uint    deadline; 
    uint256 amountCollected;  
    uint    projectStatus;  //0:expired, 1:active, 2: successfully completed 
  }

  // mapping between the project address and project information
  mapping (address => ProjInfo) info;

  // state variable of type ProjInfo to store the project information
  ProjInfo public projectInfo;

  // Funder contributions structure
  struct Funder {
    uint amount;
    uint index;
  }

  // mapping to store the list of project funders
  mapping (address => Funder) public funderslist;

  // list of funders address
  address[] public fundersAddr;

  // boolean to check if the project has been already refunded when unsuccessfull
  bool private projectrefunded = false;

  // constructor
  function Project(string _projName, address _projAddr, address _owner, uint256 _amountNeeded, uint _deadline)  {
    projectInfo = ProjInfo({
      projName:       _projName,
      owner:          _owner,
      amountNeeded:   _amountNeeded,
      deadline:       _deadline,
      amountCollected: 0,
      projectStatus:   1
    });
    info[_projAddr] = projectInfo;
  } 


  // function to fund a given project  
  function fund(address _funderAddr) payable {
    uint256 fundersamount;
    //project is still active and not yet fully funded
    if (now < projectInfo.deadline) {
      if (projectInfo.amountCollected < projectInfo.amountNeeded) {
        if (projectInfo.projectStatus == 1) {
          // store how much the funders contributed in case it is above the amount needed
          fundersamount = msg.value;
          // add the received fund to the project
          projectInfo.amountCollected = projectInfo.amountCollected + fundersamount;
          // target amount has been reached
          if (projectInfo.amountCollected > projectInfo.amountNeeded) {
            fundersamount = projectInfo.amountCollected - projectInfo.amountNeeded;
            // mark the project as successfull
            projectInfo.projectStatus = 2;
            //send the excess amount back to the funder if any
            if (!_funderAddr.send(fundersamount)) throw;
              //we send the funding money to the project owner
            payout();
          }
          Funder data = funderslist[_funderAddr];
          data.index  = fundersAddr.push(_funderAddr);
          data.amount = fundersamount;
        }
      } 
    } 
    //project has expired or fully funded 
    else {
      // fundraising period has expired
      if (now >= projectInfo.deadline) {
        // we refund the current funder
        if (msg.value > 0) {
          if (!_funderAddr.send(msg.value)) throw;
        }
        // we refund all funders if the project has not been already successfull and deadline passed
        if ((projectInfo.projectStatus != 2) && (projectrefunded = false)){
          projectrefunded = true;
          projectInfo.projectStatus = 0;
          if (this.balance > 0) {
            refund();
          }
        }
      }
      // fundraising has been successful before deadline
      if (projectInfo.amountCollected >= projectInfo.amountNeeded) {
        // we refund the current funder
        if (msg.value > 0) {
          if (!_funderAddr.send(msg.value)) throw;
        }
      }
    } 
  } 

  // function to send the funds received to the owner of the project
  function payout() private {
    if (projectInfo.projectStatus == 2) {
      if (this.balance > 0) {
        projectInfo.owner.call.value(this.balance);
      }
    }
  }

  // function to send back or retrieve contributions
  function refund() private {
      for (uint i=0; i < fundersAddr.length; i++) {
        address dest = fundersAddr[i];
        Funder c = funderslist[dest];
        if (!dest.send(c.amount)) {
          throw;
        }
      }
    }

  //fallback function
  function() payable {
    throw;
  }
}
