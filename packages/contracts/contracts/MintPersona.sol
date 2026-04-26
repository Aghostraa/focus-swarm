// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// Mint-only ERC-7857 fork. No transfer-time re-encryption oracle (out of scope for hackathon).
/// Persona brain bytes encrypted client-side (AES-256), uploaded to 0G Storage, rootHash stored as encryptedURI.
contract MintPersona is ERC721, Ownable {
    uint256 private _nextTokenId;

    mapping(uint256 => string) private _encryptedURIs;
    mapping(uint256 => bytes32) private _metadataHashes;

    event PersonaMinted(uint256 indexed tokenId, address indexed owner, string encryptedURI, bytes32 metadataHash);

    constructor() ERC721("FocusSwarmPersona", "FSP") Ownable(msg.sender) {}

    function mint(address to, string calldata encryptedURI_, bytes32 metadataHash_) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _encryptedURIs[tokenId] = encryptedURI_;
        _metadataHashes[tokenId] = metadataHash_;
        emit PersonaMinted(tokenId, to, encryptedURI_, metadataHash_);
        return tokenId;
    }

    function encryptedURI(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _encryptedURIs[tokenId];
    }

    function metadataHash(uint256 tokenId) external view returns (bytes32) {
        _requireOwned(tokenId);
        return _metadataHashes[tokenId];
    }
}
