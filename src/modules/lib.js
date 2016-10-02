const _         = require('lodash');
const entities  = require("entities");

module.exports = {
    decode: decodeEntities,
    oIdToCategory: oIdToCategory,
    keystoneToWp: keystoneToWp,
    getStatus: getStatus,
    getTitle: getTitle,
    getContent: getContent,
    getFormat: getFormat
};

function decodeEntities(str) {
    return entities.decodeHTML(str);
}

function oIdToCategory(keystoneCategories, category){
    return _.find(
        keystoneCategories,
        (keystoneCategory) => { return keystoneCategory.$oid === category.$oid }
    );
}

function keystoneToWp(keystoneCategory, wpCategories) {
    return _.find(
        wpCategories,
        (wpCategory) => { return wpCategory.slug === keystoneCategory.key }
    );
}

function getFormat(keystonePostType) {
    if (keystonePostType === 'photo') {
        return 'image';
    } else if (keystonePostType === 'text') {
        return 'standard';
    } else if (keystonePostType === 'quote') {
        return 'quote';
    } else if (keystonePostType === 'gallery') {
        return 'gallery';
    } else if (keystonePostType === 'medium') {
        //video or audio ?
    }
}

function getStatus(keystonePostState) {
    if (keystonePostState === 'published') {
        return 'publish';
    } else if (keystonePostState === 'draft') {
        return 'draft';
    }

    //error ? Will fail when calling API.create
    return "";
}

function getTitle(post) {
    if (post.type === 'quote') return post.writer;
    if (post.type === 'gallery') return post.captionText;
    return post.title || "";
}

function getContent(post) {
    if (post.type === 'quote') return decodeEntities(post.quoteText);
    if (post.type === 'text') return decodeEntities(post.contentText);
    return decodeEntities(post.title || "");
}

