const hardhat = require('hardhat');
const web3 = require('web3');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

// const attestorList = ['localhost:8801', 'localhost:8802', 'localhost:8803'];
const attestorList = ['localhost:8801'];

module.exports = async function V1flow(attestorCount) {
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];
    const protocol = accounts[1];
    const protocolWallet = accounts[2];

    for (let account of accounts) {
        console.log(account.address);
    }

    // const dlcManagerDeployInfo = await loadDeploymentInfo(
    //     hardhat.network.name,
    //     'DlcManager',
    //     'v1'
    // );

    // const dlcManager = new hardhat.ethers.Contract(
    //     dlcManagerDeployInfo.contract.address,
    //     dlcManagerDeployInfo.contract.abi,
    //     admin
    // );

    // const attestorManagerDeployInfo = await loadDeploymentInfo(
    //     hardhat.network.name,
    //     'AttestorManager',
    //     'v1'
    // );

    // const attestorManager = new hardhat.ethers.Contract(
    //     attestorManagerDeployInfo.contract.address,
    //     attestorManagerDeployInfo.contract.abi,
    //     admin
    // );

    // const mockProtocolDeployInfo = await loadDeploymentInfo(
    //     hardhat.network.name,
    //     'MockProtocol',
    //     'v1'
    // );

    // const mockProtocol = new hardhat.ethers.Contract(
    //     mockProtocolDeployInfo.contract.address,
    //     mockProtocolDeployInfo.contract.abi,
    //     protocol
    // );

    // console.log(
    //     await dlcManager.getDLC(
    //         '0x65dd78511d73729110612d109528a216a72ab64b76094a32168470eb1645585a'
    //     )
    // );

    // console.log(await attestorManager.getAllAttestors());

    // for (const attestor of attestorList) {
    //     if (!(await attestorManager.isAttestor(attestor)))
    //         await attestorManager.connect(admin).addAttestor(attestor);
    // }

    // await dlcManager.grantRole(
    //     web3.utils.soliditySha3('WHITELISTED_CONTRACT'),
    //     mockProtocol.address
    // );
    // await dlcManager.grantRole(
    //     web3.utils.soliditySha3('WHITELISTED_WALLET'),
    //     protocolWallet.address
    // );

    // const requestTx = await mockProtocol.requestCreateDLC(attestorCount);

    // const receipt = await requestTx.wait();
    // const event = receipt.events[0];
    // const decodedEvent = dlcManager.interface.parseLog(event);
    // const uuid = decodedEvent.args.uuid;
    // console.log('CreateDLCRequested:');
    // console.log(decodedEvent.args);

    // console.log('Waiting for attestors to announce...');
    // await new Promise((r) => setTimeout(r, 2000));

    // console.log('Simulating setStatusFunded...');
    // const setStatusFundedTx = await dlcManager
    //     .connect(protocolWallet)
    //     .setStatusFunded(uuid);
    // await setStatusFundedTx.wait();

    // const uuid =
    //     '0x060ab58a6fc3e49a7a69c6c4b8589255dd151a12b83e1e3f98b15a5a3531b6ac';
    // console.log('Calling closeDLC...');
    // const outcome = 7689;
    // const closeDLCtx = await mockProtocol.requestCloseDLC(uuid, outcome);
    // await closeDLCtx.wait();

    // console.log('Waiting for attestors to attest...');
    // await new Promise((r) => setTimeout(r, 2000));

    // console.log('Simulating postClose...');
    // const postCloseTx = await dlcManager
    //     .connect(protocolWallet)
    //     .postCloseDLC(uuid, outcome);
    // await postCloseTx.wait();
};
