const hardhat = require('hardhat');
const {
    loadDeploymentInfo,
} = require('./helpers/deployment-handlers_versioned');
const callManagerContractFunction = require('./helpers/00-call-dlc-manager-fn');

const { getSignatures, setSigners } = require('../test/utils');

// This script requires forking Arbitrum Mainnet from at least block 260000776
async function main() {
    await hardhat.run('compile');
    const accounts = await hardhat.ethers.getSigners();
    let attestor1, attestor2, attestor3;
    let attestors;
    attestor1 = accounts[6];
    attestor2 = accounts[7];
    attestor3 = accounts[8];
    attestors = [attestor1, attestor2, attestor3];
    let btcFeeRecipient = '0x000001';

    const dlcAdminSafe = await hardhat.ethers.getImpersonatedSigner(
        '0xaA2949C5285C2f2887ABD567865344240c29d619'
    );
    const coordinator = await hardhat.ethers.getImpersonatedSigner(
        '0x3355977947F84C2b1CAE7D2903a72958aEE185e2'
    );
    const enzymeManager = await hardhat.ethers.getImpersonatedSigner(
        '0x0DD4f29E21F10cb2E485cf9bDAb9F2dD1f240Bfa'
    );

    const enzymeComptrollerAddress =
        '0x0c164A2708477C8930E8964b3B8EB9038C86Ffee';
    const enzymeVaultAddress = '0xe1f20e9855b2bce29f92579ba193230389795b46';
    const admin = accounts[0];
    const userAddress = accounts[1].address;

    const deployInfoManager = await loadDeploymentInfo(
        hardhat.network.name,
        'DLCManager'
    );
    const dlcManagerExisting = new hardhat.ethers.Contract(
        '0x20157DBAbb84e3BBFE68C349d0d44E48AE7B5AD2',
        deployInfoManager.contract.abi,
        admin
    );

    const deployInfoToken = await loadDeploymentInfo(
        hardhat.network.name,
        'DLCBTC'
    );

    const dlcBTC = new hardhat.ethers.Contract(
        '0x050C24dBf1eEc17babE5fc585F06116A259CC77A',
        deployInfoToken.contract.abi,
        admin
    );
    let dlcManager;

    const dlcManagerExists = await hardhat.ethers.getContractAt(
        'DLCManager',
        '0xe4097Ee7b1AE8a7E5DdCaD820Ca31ee4d2d9Ef92',
        admin
    );

    // console.log('dlcManagerExists:', dlcManagerExists);

    // TODO: this check doesnt really work
    if (process.env.FORCE_DEPLOY) {
        const DLCManager =
            await hardhat.ethers.getContractFactory('DLCManager');
        dlcManager = await hardhat.upgrades.deployProxy(DLCManager, [
            '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
            '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
            2,
            dlcBTC.address,
            btcFeeRecipient,
        ]);
        await dlcManager.deployed();
        await setSigners(dlcManager, attestors);

        const txTranferOwnership = await dlcManagerExisting
            .connect(dlcAdminSafe)
            .transferTokenContractOwnership(dlcManager.address);
        await txTranferOwnership.wait();
    } else {
        dlcManager = dlcManagerExists;
    }

    console.log('dlcManager:', dlcManager.address);
    console.log('dlcBTC:', dlcBTC.address);
    console.log('dlcBTC owner:', await dlcBTC.owner());

    let poolMerchant;

    const pmExists = await hardhat.ethers.getContractAt(
        'PoolMerchant',
        '0xf96C190E181b38c840B7832BbA9E8D527250a5FB',
        admin
    );

    // console.log('pmExists:', pmExists);

    if (process.env.FORCE_DEPLOY) {
        const PoolMerchant =
            await hardhat.ethers.getContractFactory('PoolMerchant');
        poolMerchant = await hardhat.upgrades.deployProxy(PoolMerchant, [
            '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
            '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
            dlcManager.address,
            dlcBTC.address,
            enzymeComptrollerAddress,
        ]);
        await poolMerchant.deployed();
    } else {
        poolMerchant = pmExists;
    }

    const pm = new hardhat.ethers.Contract(
        poolMerchant.address,
        // '0x8d6e07a6c15e1cdb881d665e0da4d7c2004a1929',
        // ['function getNewUUID(address) view returns (bytes32)'],
        poolMerchant.interface,
        admin
    );
    console.log('pm:', pm.address);
    const uuid = await pm.getNewUUID(admin.address);
    console.log('uuid:', uuid);

    const enzymeVault = new hardhat.ethers.Contract(
        enzymeComptrollerAddress,
        [
            'function buyShares(uint256, uint256) external returns (uint256)',
            'function getDenominationAsset() external view returns (address)',
            'function vaultCallOnContract(address,bytes4,bytes) external',
        ],
        admin
    );
    const asset = await enzymeVault.getDenominationAsset();
    console.log('asset on enzyme:', asset);

    await enzymeVault
        .connect(enzymeManager)
        .vaultCallOnContract(
            '0x2C6bef68DAbf0494bB5F727E63c8FB54f7D2c287',
            '0x8da3d736',
            '0x000000000000000000000000000000000000000000000000000000000000002500000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001000000000000000000000000f96c190e181b38c840b7832bba9e8d527250a5fb'
        );

    // set up pending vault
    // set it to funded
    // PM should have the funds
    // call sweep
    // enzyme shoud have the funds

    const fakeWdTxId = 'fakeWdTxId';
    const fakeTapPK = 'fakeTapPK';
    const deposit = 100000000;

    try {
        await dlcManager.connect(admin).whitelistAddress(pm.address);
        console.log('whitelisted pm on dlcManager');
    } catch (error) {
        console.error('error whitelisting pm on dlcManager:', error);
    }
    await pm
        .connect(admin)
        .createPendingVault(userAddress, uuid, fakeTapPK, fakeWdTxId);
    console.log('created pending vault through pm');
    const dlc = await dlcManager.getDLC(uuid);
    // console.log('dlc:', dlc);
    const pmBalanceBefore = await dlcBTC.balanceOf(pm.address);
    console.log('pmBalanceBefore Funded:', pmBalanceBefore.toString());

    const signatureBytesForFunding = await getSignatures(
        {
            uuid,
            btcTxId: fakeWdTxId,
            functionString: 'set-status-funded',
            newLockedAmount: deposit,
        },
        attestors,
        3
    );
    const tx2 = await dlcManager
        .connect(attestor1)
        .setStatusFunded(uuid, fakeWdTxId, signatureBytesForFunding, deposit);
    await tx2.wait();

    const pmBalanceAfter = await dlcBTC.balanceOf(pm.address);
    console.log('pmBalanceAfter Funded:', pmBalanceAfter.toString());

    console.log(
        'pmSweptBalanceForUUIDBefore:',
        (await pm.getSweptAmountForUUID(uuid)).toString()
    );

    const enzymeVaultBalanceBefore = await dlcBTC.balanceOf(enzymeVaultAddress);
    console.log(
        'enzymeVaultBalanceBefore:',
        enzymeVaultBalanceBefore.toString()
    );

    console.log('sweeping deposits...');
    const txSweep = await pm.connect(admin).sweepDeposit();
    const txReceipt = await txSweep.wait();

    // console.log('txEvents:', txReceipt.events);

    console.log(
        'pmSweptBalanceForUUIDAfter:',
        (await pm.getSweptAmountForUUID(uuid)).toString()
    );
    const pmBalanceAfterSweep = await dlcBTC.balanceOf(pm.address);
    console.log('pmBalanceAfterSweep:', pmBalanceAfterSweep.toString());
    const enzymeVaultBalanceAfter = await dlcBTC.balanceOf(enzymeVaultAddress);
    console.log('enzymeVaultBalanceAfter:', enzymeVaultBalanceAfter.toString());

    console.log('withdrawing funds...');
    const withdrawAmount = 50000;
    const txWithdraw = await pm
        .connect(admin)
        .withdraw(uuid, withdrawAmount, fakeTapPK, fakeWdTxId);
    const txReceiptWithdraw = await txWithdraw.wait();

    const pmBalanceAfterWithdraw = await dlcBTC.balanceOf(pm.address);
    console.log('pmBalanceAfterWithdraw:', pmBalanceAfterWithdraw.toString());
    const enzymeVaultBalanceAfterWithdraw =
        await dlcBTC.balanceOf(enzymeVaultAddress);
    console.log(
        'enzymeVaultBalanceAfterWithdraw:',
        enzymeVaultBalanceAfterWithdraw.toString()
    );
    const sweptAmountsAfterWithdraw = await pm.getSweptAmountForUUID(uuid);
    console.log(
        'sweptAmountsAfterWithdraw:',
        sweptAmountsAfterWithdraw.toString()
    );

    // withdraw funds
    // set pending
    // set funded with less amount
    // sweepredeem
    // check balances

    // const signatureBytesForPending = await getSignatures(
    //     {
    //         uuid,
    //         btcTxId: fakeWdTxId,
    //         functionString: 'set-status-pending',
    //         newLockedAmount: 0,
    //     },
    //     attestors,
    //     3
    // );
    // const tx3 = await dlcManager
    //     .connect(attestor1)
    //     .setStatusPending(
    //         uuid,
    //         fakeWdTxId,
    //         signatureBytesForPending,
    //         fakeTapPK,
    //         0
    //     );
    // await tx3.wait();
    // const signatureBytesForFunding2 = await getSignatures(
    //     {
    //         uuid,
    //         btcTxId: fakeWdTxId,
    //         functionString: 'set-status-funded',
    //         newLockedAmount: newAmountLocked,
    //     },
    //     attestors,
    //     3
    // );
    // const tx4 = await dlcManager
    //     .connect(attestor1)
    //     .setStatusFunded(
    //         uuid,
    //         fakeWdTxId,
    //         signatureBytesForFunding2,
    //         newAmountLocked
    //     );
    // await tx4.wait();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

//
