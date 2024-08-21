module.exports = DLCAdminSafeAddresses = {
    arbitrum: {
        medium: process.env.ARB_MEDIUM_SAFE,
        critical: process.env.ARB_CRITICAL_SAFE,
    },
    sepolia: {
        medium: '0x9506Ea24038609679732855F757041a3C1C06623',
        critical: '0x9506Ea24038609679732855F757041a3C1C06623',
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
    optimism: {
        medium: '0x69a74Da7b00e750CC5dB06e0667e628a2aDdc91C',
        critical: '0xD984C23bE2C0Fa9b5054Bd4C848B53c53f60924e',
    },
    base: {
        medium: '0xDEb3288Dc58a85F32ebDD713594491d57727a615',
        critical: '0x548c8bf99A294FF057563557e0879f60ffd3690d',
    },
    basesepolia: {
        medium: '0x9506Ea24038609679732855F757041a3C1C06623',
        critical: '0x9506Ea24038609679732855F757041a3C1C06623',
    },
};
