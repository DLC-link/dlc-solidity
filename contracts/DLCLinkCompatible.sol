// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

interface DLCLinkCompatible {
  function postCreateDLCHandler(bytes32 uuid) external;
  function setStatusFunded(bytes32 uuid) external;
}
