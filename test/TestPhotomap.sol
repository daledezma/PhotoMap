pragma solidity ^0.8.19;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../contracts/PhotoMap.sol";

// Solidity assertion tests for PhotoMap.
// Truffle deploys this test contract and runs each function starting with "test".
contract TestPhotoMap {
    PhotoMap photoMap;

    // Fresh contract before each test so tests don't affect each other.
    function beforeEach() public {
        photoMap = new PhotoMap();
    }

    // Test 1: the migrated contract starts with no photos.
    function testDeployedContractStartsEmpty() public {
        PhotoMap deployed = PhotoMap(DeployedAddresses.PhotoMap());
        Assert.equal(deployed.getPhotoCount(), 0, "Deployed contract should start with 0 photos");
    }

    // Test 2: addPhoto increases the count and stores the correct data.
    function testAddPhotoStoresData() public {
        photoMap.addPhoto("QmTestHash123", "41.8781,-87.6298");

        Assert.equal(photoMap.getPhotoCount(), 1, "Photo count should be 1 after adding a photo");

        (address owner, string memory ipfsHash, string memory location, uint likes) = photoMap.photos(0);
        Assert.equal(owner, address(this), "Owner should be the address that added the photo");
        Assert.equal(ipfsHash, "QmTestHash123", "IPFS hash should match");
        Assert.equal(location, "41.8781,-87.6298", "Location should match");
        Assert.equal(likes, 0, "New photo should have 0 likes");
    }

    // Test 3: likePhoto increments the like count.
    function testLikePhotoIncrementsLikes() public {
        photoMap.addPhoto("QmTestHash456", "42.6792,-88.2765");
        photoMap.likePhoto(0);
        photoMap.likePhoto(0);

        (, , , uint likes) = photoMap.photos(0);
        Assert.equal(likes, 2, "Photo should have 2 likes");
    }
}

