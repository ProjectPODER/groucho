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
        party_rules: [],
        party_fields: []
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
            range: getRuleField(rule, 'range'),             // VALIDAR
            file: getRuleField(rule, 'file'),               // VALIDAR
            function: getRuleField(rule, 'function'),       // VALIDAR
        };

        rulesArr.contract_rules.push(ruleObj);
    } );

    let party_rules = flags.parties;

    party_rules.map( (rule) => {
        var ruleObj = {
            id: rule.id,
            name: rule.name,
            category: rule.category,
            categoryID: getIDFromString(rule.id),
            flagType: rule.type,
            fields: getRuleField(rule, 'fields'),           // VALIDAR
            limit: getRuleField(rule, 'limit'),             // VALIDAR
            global: getRuleField(rule, 'global'),             // VALIDAR
            minimum_contract_count: getRuleField(rule, 'minimum_contract_count'),
            accumulator_minimum: getRuleField(rule, 'accumulator_minimum')
        };

        if(ruleObj.fields && ruleObj.fields.length > 0) {
            ruleObj.fields.map (field => {
                if(rulesArr.party_fields.indexOf(field) < 0) rulesArr.party_fields.push(field);
            });
        }

        var expandedRules = [];
        if(ruleObj.limit) {
            if(ruleObj.limit.length > 1) {
                ruleObj.limit.map( value => {
                    // Create new rules for each limit value
                    let newRuleObj = JSON.parse(JSON.stringify(ruleObj));
                    newRuleObj.id += cleanValue(value);
                    newRuleObj.limit = value;
                    expandedRules.push(newRuleObj);
                } );
            }
            else {
                ruleObj.limit = ruleObj.limit[0];
                expandedRules.push(ruleObj);
            }
        }
        else expandedRules.push(ruleObj);

        rulesArr.party_rules.push(...expandedRules);
    } );

    return rulesArr;
}

function cleanValue(value) {
    let valueStr = value.toString();
    return valueStr.replace('0.', '');
}

function getCriteriaObject(flags) {
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
