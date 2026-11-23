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
        photoMap.addPhoto("QmTestHash123", 41878100, -87629800);

        Assert.equal(photoMap.getPhotoCount(), 1, "Photo count should be 1 after adding a photo");

        (address owner, int32 lat, int32 lng, uint32 likes, string memory ipfsHash) = photoMap.photos(0);
        Assert.equal(owner, address(this), "Owner should be the address that added the photo");
        Assert.equal(int(lat), int(41878100), "Latitude should match");
        Assert.equal(int(lng), int(-87629800), "Longitude should match");
        Assert.equal(uint(likes), 0, "New photo should have 0 likes");
        Assert.equal(ipfsHash, "QmTestHash123", "IPFS hash should match");
    }

    // Test 3: likePhoto increments the like count and records the liker.
    function testLikePhotoIncrementsLikes() public {
        photoMap.addPhoto("QmTestHash456", 42679200, -88276500);
        photoMap.likePhoto(0);

        (, , , uint32 likes, ) = photoMap.photos(0);
        Assert.equal(uint(likes), 1, "Photo should have 1 like");
        Assert.isTrue(photoMap.hasLiked(0, address(this)), "Liker should be recorded");
    }

    // Test 4: the same wallet cannot like a photo twice.
    function testCannotLikeTwice() public {
        photoMap.addPhoto("QmTestHash789", 41878100, -87629800);
        photoMap.likePhoto(0);

        // Low-level call returns false instead of stopping the test when it reverts.
        (bool ok, ) = address(photoMap).call(abi.encodeWithSignature("likePhoto(uint256)", 0));
        Assert.isFalse(ok, "Second like from the same wallet should revert");

        (, , , uint32 likes, ) = photoMap.photos(0);
        Assert.equal(uint(likes), 1, "Like count should still be 1");
    }

    // Test 5: coordinates outside the valid range are rejected.
    function testRejectsInvalidLocation() public {
        (bool ok, ) = address(photoMap).call(
            abi.encodeWithSignature("addPhoto(string,int32,int32)", "QmBad", int32(95000000), int32(0))
        );
        Assert.isFalse(ok, "Latitude above 90 should revert");
        Assert.equal(photoMap.getPhotoCount(), 0, "No photo should be stored");
    }
}

