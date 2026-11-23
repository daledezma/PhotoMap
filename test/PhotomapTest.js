const PhotoMap = artifacts.require("PhotoMap");

contract("PhotoMap", (accounts) => {
  const [alice, bob] = accounts;
  let photoMap;

  // Fresh contract before each test.
  beforeEach(async () => {
    photoMap = await PhotoMap.new();
  });

  // Test 1: each user's photo is saved with the right owner and data.
  it("stores photos from different users with the correct owner", async () => {
    await photoMap.addPhoto("QmAliceHash", 41878100, -87629800, { from: alice });
    await photoMap.addPhoto("QmBobHash", 42679200, -88276500, { from: bob });

    const count = await photoMap.getPhotoCount();
    assert.equal(count.toNumber(), 2, "Should have 2 photos");

    const photo0 = await photoMap.photos(0);
    assert.equal(photo0.owner, alice, "Photo 0 owner should be Alice");
    assert.equal(photo0.ipfsHash, "QmAliceHash", "Photo 0 hash should match");

    const photo1 = await photoMap.photos(1);
    assert.equal(photo1.owner, bob, "Photo 1 owner should be Bob");
    assert.equal(photo1.lat.toString(), "42679200", "Photo 1 latitude should match");
    assert.equal(photo1.lng.toString(), "-88276500", "Photo 1 longitude should match");
  });

  // Test 2: likes from other users are counted.
  it("increments likes when other users like a photo", async () => {
    await photoMap.addPhoto("QmAliceHash", 41878100, -87629800, { from: alice });
    await photoMap.likePhoto(0, { from: bob });
    await photoMap.likePhoto(0, { from: accounts[2] });

    const photo = await photoMap.photos(0);
    assert.equal(photo.likes.toNumber(), 2, "Photo should have 2 likes");
  });

  // Test 3: liking a photo that doesn't exist is rejected.
  it("reverts when liking a photo that does not exist", async () => {
    try {
      await photoMap.likePhoto(99, { from: bob });
      assert.fail("Expected likePhoto(99) to revert");
    } catch (error) {
      assert(error.message.includes("revert"), "Expected a revert, got: " + error.message);
    }
  });

  // Test 4: the same wallet cannot like a photo twice.
  it("rejects a second like from the same wallet", async () => {
    await photoMap.addPhoto("QmAliceHash", 41878100, -87629800, { from: alice });
    await photoMap.likePhoto(0, { from: bob });

    try {
      await photoMap.likePhoto(0, { from: bob });
      assert.fail("Expected the second like to revert");
    } catch (error) {
      assert(error.message.includes("revert"), "Expected a revert, got: " + error.message);
    }

    const photo = await photoMap.photos(0);
    assert.equal(photo.likes.toNumber(), 1, "Like count should still be 1");
  });

  // Test 5: events are emitted and getPhotos() returns everything in one call.
  it("emits events and returns all photos with getPhotos()", async () => {
    const tx = await photoMap.addPhoto("QmAliceHash", 41878100, -87629800, { from: alice });
    assert.equal(tx.logs[0].event, "PhotoAdded", "Should emit PhotoAdded");
    assert.equal(tx.logs[0].args.owner, alice, "Event owner should be Alice");

    const likeTx = await photoMap.likePhoto(0, { from: bob });
    assert.equal(likeTx.logs[0].event, "PhotoLiked", "Should emit PhotoLiked");
    assert.equal(likeTx.logs[0].args.likes.toString(), "1", "Event should report 1 like");

    await photoMap.addPhoto("QmBobHash", 42679200, -88276500, { from: bob });
    const all = await photoMap.getPhotos();
    assert.equal(all.length, 2, "getPhotos should return 2 photos");
    assert.equal(all[1].ipfsHash, "QmBobHash", "Second photo hash should match");
  });
});

