# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-12-26

### Added
- **SessionManager**: Create and manage NEAR session keys for signless transactions
  - `createSessionKey()` - One-time wallet signature to enable background transactions
  - `callMethod()` - Execute contract methods without wallet popups
  - `hasSessionKey()` - Check if valid session exists on-chain
- **LitClient**: Lit Protocol integration for decentralized encryption
  - `encryptFile()` / `decryptFile()` - File encryption with access control
  - `getSessionSigsWithPKP()` - PKP-based session signatures
- **LighthouseClient**: IPFS storage via Lighthouse
  - `uploadFile()` - Standard file upload
  - `uploadEncryptedFile()` - Encrypted file upload with access conditions
- **MPC Utilities**: Chain signature helpers
  - `deriveEthAddress()` - Derive ETH address from NEAR account
  - `signWithMPC()` - Sign messages using NEAR MPC
- **Batch Transactions**: Combine multiple actions into single signature
- **Default Configuration**: Pre-configured for NEAR testnet and Lit datil-test

### Changed
- N/A (Initial release)

### Fixed
- N/A (Initial release)
