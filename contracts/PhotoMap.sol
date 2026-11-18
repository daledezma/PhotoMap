pragma solidity ^0.8.19;

// PhotoMap prototype: users pin a photo to a map location.
contract PhotoMap {
    struct Photo {
        address owner;
        string ipfsHash;   // where the image is stored (IPFS)
        string location;   // e.g. "41.8781,-87.6298"
        uint likes;
    }

    Photo[] public photos;

    // photo id => wallet => already liked?
    mapping(uint => mapping(address => bool)) public hasLiked;

    function addPhoto(string memory _ipfsHash, string memory _location) public {
        photos.push(Photo(msg.sender, _ipfsHash, _location, 0));
    }

    function likePhoto(uint _id) public {
        require(_id < photos.length, "Photo does not exist");
        require(!hasLiked[_id][msg.sender], "Already liked this photo");
        hasLiked[_id][msg.sender] = true;
        photos[_id].likes++;
    }

    function getPhotoCount() public view returns (uint) {
        return photos.length;
    }
}
