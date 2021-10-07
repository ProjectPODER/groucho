const fs = require('fs');

function getRuleField(rule, field) {
    if(rule.hasOwnProperty(field)) {
        return rule[field];
    }
    else {
        return null;
    }
}

function getIDFromString(string) {
    if(string.indexOf('-') >= 0)
        return string.split('-')[0];
    else
        return '';
}

function parseFlags(file) {
    // Read file
    let rawdata = fs.readFileSync(file);

    // Parse file
    let flags = JSON.parse(rawdata);
    let contract_rules = flags.contracts;

    // Build rulesObj
    let rulesArr = {
        ruleset_id: flags.id,
        contract_rules: [],
        party_rules: []
    };
    contract_rules.map( (rule) => {
        var ruleObj = {
            id: rule.id,
            name: rule.name,
            category: rule.category,
            categoryID: getIDFromString(rule.id),
            flagType: rule.type,
            fields: getRuleField(rule, 'fields'),           // VALIDAR
            values: getRuleField(rule, 'values'),           // VALIDAR
            dates: getRuleField(rule, 'dates'),             // VALIDAR
            difference: getRuleField(rule, 'difference'),   // VALIDAR
        };

        rulesArr.contract_rules.push(ruleObj);
    } );

    let party_rules = flags.parties;

    party_rules.map( (rule) => {
        var ruleObj = {
            id: rule.id,
            name: rule.name,
            category: rule.category,
            categoryID: "conf",
            flagType: rule.type,
            fields: getRuleField(rule, 'fields'),           // VALIDAR
            values: getRuleField(rule, 'values'),           // VALIDAR
            dates: getRuleField(rule, 'dates'),             // VALIDAR
            difference: getRuleField(rule, 'difference'),   // VALIDAR
        };

        rulesArr.party_rules.push(ruleObj);
    } );


    return rulesArr;
}

function getCriteriaObject(flags) {
    // console.log("getCriteriaObject",flags);
    var criteriaArr = [];
    flags.map( (flag) => {
        if( !criteriaArr.includes(flag.categoryID) ) {
            criteriaArr.push(flag.categoryID);
        }
    } );

    var criteriaObj = { total_score: 0 };
    criteriaArr.map( (item) => {
        criteriaObj[item] = 0;
    } );

    return criteriaObj;
}

function getPartyCriteriaObject(flags) {
    // console.log("getPartyCriteriaObject",flags);
    var criteriaArr = [];
    flags.map( (flag) => {
        if( !criteriaArr.includes(flag.id) ) {
            criteriaArr.push(flag.id);
        }
    } );

    var criteriaObj = { total_score: 0 };
    criteriaArr.map( (item) => {
        criteriaObj[item] = 0;
    } );

    return criteriaObj;
}

module.exports = { parseFlags, getCriteriaObject, getPartyCriteriaObject };
