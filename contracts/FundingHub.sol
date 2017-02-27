pragma solidity ^0.4.4;

import 'Project.sol';

contract FundingHub {
  
  //registry of all projects
  mapping(string => address) projects;
  mapping(string => uint) activeProjects;
  string[] public projectNames;
  string public projectlist; 


  // constructor function
  function FundingHub() {
    // nothing to be done here
  }

  // function to create a new project
  function createProject(string _projName, uint256 _amountNeeded, uint _deadline) external {
    uint deadlineMinutes = _deadline * 1 minutes + now;
    // some basic checks
    if (_amountNeeded == 0) throw;
    if (_deadline < now) throw;
    // creating a new project
    Project project     = new Project(_projName, this, msg.sender, _amountNeeded, deadlineMinutes);
    projects[_projName] = project;  //name of the project is the key (assuming that there is no 2 projects with the same name)
    activeProjects[_projName] = deadlineMinutes;
    projectNames.push(_projName);
  } 

  // function to contribute to a project
  function contribute(string _projName) payable {
    // getting the project address from the project name
    address _projAddr = projects[_projName];
    // contribute funds to the given project
    Project(_projAddr).fund.value(msg.value)(msg.sender);
  }  

  // function to cancatenate string, retrieved from http://ethereum.stackexchange.com/questions/729/how-to-concatenate-strings-in-solidity
  function strConcat(string _a, string _b, string _c, string _d, string _e) internal returns (string){
    bytes memory _ba = bytes(_a);
    bytes memory _bb = bytes(_b);
    bytes memory _bc = bytes(_c);
    bytes memory _bd = bytes(_d);
    bytes memory _be = bytes(_e);
    string memory abcde = new string(_ba.length + _bb.length + _bc.length + _bd.length + _be.length);
    bytes memory babcde = bytes(abcde);
    uint k = 0;
    for (uint i = 0; i < _ba.length; i++) babcde[k++] = _ba[i];
    for (i = 0; i < _bb.length; i++) babcde[k++] = _bb[i];
    for (i = 0; i < _bc.length; i++) babcde[k++] = _bc[i];
    for (i = 0; i < _bd.length; i++) babcde[k++] = _bd[i];
    for (i = 0; i < _be.length; i++) babcde[k++] = _be[i];
    return string(babcde);
  }

  // function to cancatenate string for our specific contract
  function strConcatUse(string _a, string _b) internal returns (string) {
    return strConcat(_a, "  " , _b, "", "");
  }

  // function to get active projects
  function getActiveProjects() constant returns(string) {
    for (uint i = 0; i < projectNames.length; i++) {
      if (now < activeProjects[projectNames[i]]) {
        projectlist = strConcatUse(projectNames[i], projectlist);
      }
    } 
    return projectlist;
  } 

  //fallback function
  function() payable {
    throw;
  }

}
