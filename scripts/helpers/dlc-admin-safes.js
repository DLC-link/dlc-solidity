module.exports = DLCAdminSafeAddresses = {
    arbitrum: {
        medium: process.env.ARB_MEDIUM_SAFE,
        critical: process.env.ARB_CRITICAL_SAFE,
    },
    sepolia: {
        medium: '0x95a8A6f1800540060D76a3831f22CB53972Eea6E',
        critical: '0x95a8A6f1800540060D76a3831f22CB53972Eea6E',
    },
    arbsepolia: {
        medium: '0xbf7184178d610d7b0239a5cb8d64c1df22d306a9',
        critical: '0xbf7184178d610d7b0239a5cb8d64c1df22d306a9',
    },
    localhost: {
        medium: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        critical: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    }, // Hardhat default deployer account
    mainnet: {
        medium: '0x442691Af617ce33878b0864501Ab74161870856f',
        critical: '0x207d1Bb4e1162Fa97E8117552fefB250653Aaee7',
    },
};
