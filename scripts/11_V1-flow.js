const hardhat = require('hardhat');
const web3 = require('web3');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');

module.exports = async function V1flow(attestorCount) {
    const accounts = await hardhat.ethers.getSigners();
    const admin = accounts[0];
    const protocol = accounts[1];
    const protocolWallet = accounts[2];

    const dlcManagerDeployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'DlcManager',
        'v1'
    );

    const dlcManager = new hardhat.ethers.Contract(
        dlcManagerDeployInfo.contract.address,
        dlcManagerDeployInfo.contract.abi,
        admin
    );

    const attestorManagerDeployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'AttestorManager',
        'v1'
    );

    const attestorManager = new hardhat.ethers.Contract(
        attestorManagerDeployInfo.contract.address,
        attestorManagerDeployInfo.contract.abi,
        admin
    );

    const mockProtocolDeployInfo = await loadDeploymentInfo(
        hardhat.network.name,
        'MockProtocol',
        'v1'
    );

    const mockProtocol = new hardhat.ethers.Contract(
        mockProtocolDeployInfo.contract.address,
        mockProtocolDeployInfo.contract.abi,
        protocol
    );

    if (await attestorManager.isAttestor('localhost'))
        await attestorManager.connect(admin).removeAttestor('localhost');
    if (await attestorManager.isAttestor('dlc.link/attestor'))
        await attestorManager
            .connect(admin)
            .removeAttestor('dlc.link/attestor');
    if (await attestorManager.isAttestor('someAttestorDomain.com'))
        await attestorManager
            .connect(admin)
            .removeAttestor('someAttestorDomain.com');

    await attestorManager.connect(admin).addAttestor('localhost');
    await attestorManager.connect(admin).addAttestor('dlc.link/attestor');
    await attestorManager.connect(admin).addAttestor('someAttestorDomain.com');
    // console.log(await attestorManager.isAttestor('localhost'));
    // console.log(await attestorManager.isAttestor('dlc.link/attestor'));
    // console.log(await attestorManager.isAttestor('someAttestorDomain.com'));

    await dlcManager.grantRole(
        web3.utils.soliditySha3('WHITELISTED_CONTRACT'),
        mockProtocol.address
    );
    await dlcManager.grantRole(
        web3.utils.soliditySha3('WHITELISTED_WALLET'),
        protocolWallet.address
    );

    const requestTx = await mockProtocol.requestCreateDLC(attestorCount);

    const receipt = await requestTx.wait();
    const event = receipt.events[0];
    const decodedEvent = dlcManager.interface.parseLog(event);
    const uuid = decodedEvent.args.uuid;
    console.log('CreateDLCRequested:');
    console.log(decodedEvent.args);

    console.log('Waiting for attestors to announce...');
    await new Promise((r) => setTimeout(r, 2000));

    console.log('Simulating setStatusFunded...');
    const setStatusFundedTx = await dlcManager
        .connect(protocolWallet)
        .setStatusFunded(uuid);
    await setStatusFundedTx.wait();

    console.log('Calling closeDLC...');
    const outcome = 7689;
    const closeDLCtx = await mockProtocol.requestCloseDLC(uuid, outcome);
    await closeDLCtx.wait();

    console.log('Waiting for attestors to attest...');
    await new Promise((r) => setTimeout(r, 2000));

    console.log('Simulating postClose...');
    const postCloseTx = await dlcManager
        .connect(protocolWallet)
        .postCloseDLC(uuid, outcome);
    await postCloseTx.wait();
};
