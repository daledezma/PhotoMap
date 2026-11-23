pragma solidity ^0.8.19;

// PhotoMap: users pin a photo (stored on IPFS) to a map location.
contract PhotoMap {
    // Optimization: owner (20 bytes) + lat (4) + lng (4) + likes (4) = 32 bytes,
    // so these four fields share ONE storage slot. The IPFS hash string is stored separately.
    struct Photo {
        address owner;
        int32 lat;        // latitude  x 1,000,000 (e.g. 41.878100 -> 41878100)
        int32 lng;        // longitude x 1,000,000
        uint32 likes;
        string ipfsHash;  // where the image is stored (IPFS)
    }

    Photo[] public photos;

    // photo id => wallet => already liked?
    mapping(uint256 => mapping(address => bool)) public hasLiked;

    // Optimization: custom errors are cheaper than require() with message strings.
    error InvalidLocation();
    error PhotoDoesNotExist();
    error AlreadyLiked();

    // Optimization: events let the front end react to changes without re-reading storage.
    event PhotoAdded(uint256 indexed id, address indexed owner, string ipfsHash, int32 lat, int32 lng);
    event PhotoLiked(uint256 indexed id, address indexed liker, uint32 likes);

    // Optimization: external + calldata avoids copying the string into memory.
    function addPhoto(string calldata _ipfsHash, int32 _lat, int32 _lng) external {
        if (_lat < -90_000_000 || _lat > 90_000_000 || _lng < -180_000_000 || _lng > 180_000_000) {
            revert InvalidLocation();
        }
        photos.push(Photo(msg.sender, _lat, _lng, 0, _ipfsHash));
        emit PhotoAdded(photos.length - 1, msg.sender, _ipfsHash, _lat, _lng);
    }

    function likePhoto(uint256 _id) external {
        if (_id >= photos.length) revert PhotoDoesNotExist();
        if (hasLiked[_id][msg.sender]) revert AlreadyLiked();
        hasLiked[_id][msg.sender] = true;
        uint32 newLikes = ++photos[_id].likes;
        emit PhotoLiked(_id, msg.sender, newLikes);
    }

    function getPhotoCount() external view returns (uint256) {
        return photos.length;
    }

    // Returns every photo in one call so the map loads with a single request (view = no gas).
    function getPhotos() external view returns (Photo[] memory) {
        return photos;
    }
}

