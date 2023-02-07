// const helper = require('./timeHelpers.js');
// const truffleAssert = require('truffle-assertions');

// const DLCManager = artifacts.require("DLCManager");
// const MockV3Aggregator = artifacts.require("MockV3Aggregator");

// const UUID = "X5hvZBBY";
// const UUID2 = "fakeUUID";
// const oneDay = 24*60*60;
// const today = Math.floor(Date.now() / 1000)
// const tomorrow = today + oneDay;
// const dayAfterTomorrow = tomorrow + oneDay;

// // the tests run in chronological order
// // the second describe section removes the pastDLC as expected

// contract("DLCManager", (accounts) => {
//     let DLCManager;
//     let mockV3Aggregator;

//     before(async () => {
//         snapShot = await helper.takeSnapshot();
//         snapshotId = snapShot['result'];
//         DLCManager = await DLCManager.deployed();
//         mockV3Aggregator = await MockV3Aggregator.deployed();
//     });

//     after("revert back time", async() => {
//         await helper.revertToSnapShot(snapshotId);
//     });

//     describe("adding new DLC and retrieving it", async () => {
//         before(async () => {
//             await _addRecentDLC();
//             await _addFutureDLC();
//             // cancelled by hand
//             await _addDLCWithData("cancelUUID", tomorrow, accounts[0]);
//         });

//         it("Can't early cancel DLC if not admin", async () => {
//             await truffleAssert.reverts(DLCManager.cancelEarly("cancelUUID", { from: accounts[1] }), "AccessControl: account " + accounts[1].toLowerCase() + " is missing role " + await DLCManager.DLC_ADMIN_ROLE());
//         });

//         it("Can cancel DLC early", async () => {
//             const result = await DLCManager.cancelEarly("cancelUUID");
//             const closedDLC = await DLCManager.dlcs("cancelUUID");
//             truffleAssert.eventEmitted(
//                 result,
//                 "EarlyCloseDLC",
//                 (ev) => ev.UUID.toString() === "cancelUUID" && ev.price.toString() === "100",
//                 "EarlyCloseDLC event should be triggered"
//               );
//             assert.equal(closedDLC.closingPrice, 100, "Price should be set");
//             assert.notEqual(closedDLC.actualClosingTime, 0, "Actual Closing time should be set");
//         });

//         it("DLC UUID added to open UUIDs", async () => {
//             const newDLC = await DLCManager.openUUIDs(0);
//             assert.equal(newDLC, UUID, "The added DLC UUID should be " + UUID);
//         });

//         it("Can't add the same DLC", async () => {
//             await truffleAssert.reverts(_addRecentDLC(), "DLC already added");
//         });

//         it("UUID and closing time set on DLC", async () => {
//             const newDLC = await DLCManager.dlcs(UUID);
//             assert.equal(newDLC.UUID, UUID, "The added DLC UUID should be " + UUID);
//             assert.notEqual(newDLC.closingTime, 0, "Closing time should be set");
//         });

//         it("Can't return DLC if it is not closed", async () => {
//             await truffleAssert.reverts(DLCManager.closingPriceAndTimeOfDLC(UUID), "The requested DLC is not closed yet");
//         });

//         it("Can return all open DLCs", async () => {
//             const allOpenDLC = await DLCManager.allOpenDLC();
//             assert.equal(allOpenDLC.length, 2, "OpenDLCs length should be 2");
//             assert.equal(allOpenDLC[0], UUID, "OpenDLC at index 0 should be " + UUID);
//         });

//         it("Account has DLC_ADMIN_ROLE", async () => {
//             let isAdmin = await DLCManager.hasRole(web3.utils.keccak256("DLC_ADMIN_ROLE"), accounts[0])
//             assert.equal(isAdmin, true, "Account provided during deploy should have DLC_ADMIN_ROLE");
//         });

//         it("Can't call addNewDLC with unauthorized account", async () => {
//             await truffleAssert.reverts(_addDLCWithData("fakeUUID", today, accounts[1]), "AccessControl: account " + accounts[1].toLowerCase() + " is missing role " + await DLCManager.DLC_ADMIN_ROLE());
//         });

//     });

//     describe("Keeper related methods and function calls", async () => {
//         before("fast forward in time", async () => {
//             await helper.advanceTimeAndBlock(3 * 60 * 60); // fast forward time so we can test DLC closing
//         });
//         let performData;
//         it("checkUpKeep should return true and the correct UUID with index", async () => {
//             performData = await DLCManager.checkUpkeep("0x");
//             const decodedPeformData = web3.eth.abi.decodeParameter(
//                 {
//                     "PerformDataPack": {
//                       "UUID": 'string',
//                       "index": 'uint256',
//                     }
//                 }
//             , performData[1]);
//             assert.equal(performData[0], true, "upkeepNeeded should be true");
//             assert.equal(decodedPeformData.UUID, UUID, "UUID should be " + UUID);
//             assert.equal(decodedPeformData.index, 0, "index should be 0");
//         });

//         it("performUpkeep should set DLC closing price and actualClosingTime and remove UUID from openUUIDs", async () => {
//             await DLCManager.performUpkeep(performData[1]);

//             const allOpenDLC = await DLCManager.allOpenDLC();

//             assert.equal(allOpenDLC.length, 1, "OpenDLCs length should be 1");

//             const removed = allOpenDLC.filter(uuid => uuid === UUID);
//             assert.equal(removed.length, 0, "Closed DLC's UUID should not be present in allOpenDLCs");

//             const closedDLC = await DLCManager.dlcs(UUID);
//             assert.equal(closedDLC.closingPrice, 100, "Price should be set");
//             assert.notEqual(closedDLC.actualClosingTime, 0, "Actual Closing time should be set");
//         });

//         it("performUpkeep should should revert if called with closed DLC", async () => {
//             await truffleAssert.reverts(DLCManager.performUpkeep(performData[1]), "Validation failed for performUpKeep for UUID: " + UUID);
//         });
//     });

//     describe("View functions after completion", async () => {
//         it("Return DLC closingPrice and actualClosingTime", async () => {
//             const result = await DLCManager.closingPriceAndTimeOfDLC(UUID);
//             assert.equal(result[0], 100, "Price should be set");
//             assert.notEqual(result[1], 0, "Actual Closing time should be returned");
//         });

//         it("allOpenDLC should return only 1 UUID", async () => {
//             const allOpenDLC = await DLCManager.allOpenDLC();
//             assert.equal(allOpenDLC.length, 1, "OpenDLCs length should be 1");
//             assert.equal(allOpenDLC[0], UUID2, "OpenDLC at index 0 should be " + UUID2);
//         });

//     });
//     async function _addRecentDLC() {
//         // add new DLC with a timeStamp which is in the past
//         await DLCManager.addNewDLC(UUID, mockV3Aggregator.address, today + 60 * 60, tomorrow, { from: accounts[0] });
//     }

//     async function _addFutureDLC() {
//         // add new DLC with a timeStamp which is in the future
//         await DLCManager.addNewDLC(UUID2, mockV3Aggregator.address, tomorrow, dayAfterTomorrow, { from: accounts[0] });
//     }

//     async function _addDLCWithData(uuid, timeStamp, account) {
//         await DLCManager.addNewDLC(uuid, mockV3Aggregator.address, timeStamp, dayAfterTomorrow, { from: account });
//     }
// });
