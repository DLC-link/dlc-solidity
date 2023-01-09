// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

interface DLCLinkCompatible {
  function postCreateDLCHandler(uint256 _nonce) external;
}
