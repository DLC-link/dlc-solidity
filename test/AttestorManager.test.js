const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('AttestorManager', function () {
    let AttestorManager, attestorManager, admin, addr1, addr2;
    const TEST_ATTESTOR_1 = '192.168.1.1';
    const TEST_ATTESTOR_2 = '192.168.1.2';

    beforeEach(async () => {
        AttestorManager = await ethers.getContractFactory('AttestorManager');
        [admin, addr1, addr2, _] = await ethers.getSigners();
        attestorManager = await AttestorManager.deploy();
        await attestorManager.deployed();
    });

    it('Should deploy the contract and set admin role', async () => {
        expect(
            await attestorManager.hasRole(
                await attestorManager.ADMIN_ROLE(),
                admin.address
            )
        ).to.equal(true);
    });

    it('Should allow admin to add attestor', async () => {
        await attestorManager.connect(admin).addAttestor(TEST_ATTESTOR_1);
        // The attestor is not a role, so we can't use hasRole here.
        expect(await attestorManager.isAttestor(TEST_ATTESTOR_1)).to.equal(
            true
        );
    });

    it('Should allow admin to remove attestor', async () => {
        await attestorManager.connect(admin).addAttestor(TEST_ATTESTOR_1);
        await attestorManager.connect(admin).removeAttestor(TEST_ATTESTOR_1);
        // Check the attestor has been removed correctly.
        expect(await attestorManager.isAttestor(TEST_ATTESTOR_1)).to.equal(
            false
        );
    });

    it('Should not allow non-admin to add or remove attestor', async () => {
        // Check the error message has been changed to match the actual error message returned by the contract.
        await expect(
            attestorManager.connect(addr1).addAttestor(TEST_ATTESTOR_1)
        ).to.be.revertedWith(
            'AttestorManager: must have admin role to perform this action'
        );
        await expect(
            attestorManager.connect(addr1).removeAttestor(TEST_ATTESTOR_1)
        ).to.be.revertedWith(
            'AttestorManager: must have admin role to perform this action'
        );
    });

    it('Should retrieve correct number of random attestors', async () => {
        await attestorManager.connect(admin).addAttestor(TEST_ATTESTOR_1);
        await attestorManager.connect(admin).addAttestor(TEST_ATTESTOR_2);
        const randomAttestors = await attestorManager.getRandomAttestors(1);
        expect(randomAttestors.length).to.equal(1);
    });
});
