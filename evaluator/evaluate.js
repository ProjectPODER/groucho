const {
    checkFieldsRateFlag,
    checkComprensibilityFlag,
    checkDatesFlag,
    checkFieldsComparisonFlag,
    checkFieldsFlag,
    checkFieldsValueFlag,
    checkFieldValueRangeFlag,
    checkNotFieldsFlag,
    checkSchemaFlag,
    checkSectionsFlag,
    checkUrlFieldFlag,
    checkNotUrlFieldFlag,
    dateDifferenceFlag,
    customFlag,
    getContractFields
} = require('./redFlags/redFlags');
const laundry = require('company-laundry');
const _ = require('lodash');
const accumulativeAverage = require('./utils.js');

function getContractYear(contract) {
    let startDate = '';

    if ( Object.prototype.toString.call(contract.contracts[0].period.startDate) === "[object Date]" )
        startDate = contract.contracts[0].period.startDate.toISOString();
    else
        startDate = contract.contracts[0].period.startDate;

    return startDate.split('-')[0];
}

function getFlagScore(record, contract, flag) {
    switch(flag.flagType) {
        case 'check-fields-rate':
            return checkFieldsRateFlag(contract, flag.fields);
        case 'check-dates-bool':
            return checkDatesFlag(contract, flag.fields, flag.values);
        case 'check-field-value-bool':
            return checkFieldsValueFlag(contract, flag.fields, flag.values);
        case 'check-field-value-range':
            return checkFieldValueRangeFlag(contract, flag.fields, flag.range);
        case 'check-fields-bool':
            return checkFieldsFlag(contract, flag.fields);
        case 'check-fields-inverse':
            return checkNotFieldsFlag(contract, flag.fields);
        case 'check-schema-bool':
            return checkSchemaFlag(record);
        case 'check-sections-rate':
            return checkSectionsFlag(contract, flag.fields);
        case 'check-url-bool':
            return checkUrlFieldFlag(contract, flag.fields);
        case 'check-url-inverse':
            return checkNotUrlFieldFlag(contract, flag.fields);
        case 'comprensibility':
            return checkComprensibilityFlag(contract, flag.fields);
        case 'date-difference-bool':
            return dateDifferenceFlag(contract, flag.fields, flag.difference);
        case 'field-equality-bool':
            return checkFieldsComparisonFlag(contract, flag.fields, 0);
        case 'field-inequality-bool':
            return checkFieldsComparisonFlag(contract, flag.fields, 1);
        case 'custom':
            return customFlag(contract, flag);
    }
}

function getContractsFromRecord(record) {
    let contracts = [];
    record.contracts.map( (contract) => {
        let buyer_id = record.buyer.id;
        let buyer_party = record.parties.filter( (party) => party.id == buyer_id )[0];
        let award_id = contract.awardID;
        let award = record.awards.filter( (award) => award.id == award_id )[0];
        let supplier_ids = [];
        award.suppliers.map( (supplier) => supplier_ids.push(supplier.id) );
        let supplier_parties = record.parties.filter( (party) => supplier_ids.indexOf(party.id) >= 0 );

        let funder_party = null;
        let funder_arr = record.parties.filter( (party) => party.roles[0] == "funder" );
        if(funder_arr.length > 0) funder_party = funder_arr[0];

        let computed_contract = {};
        for( var x in record ) {
            switch(x) {
                case 'parties':
                    if(buyer_party)
                        computed_contract.parties = [ buyer_party ];
                    else
                        computed_contract.parties = [];
                    if(supplier_parties.length > 0)
                        supplier_parties.map( (supplier) => computed_contract.parties.push(supplier) );
                    if(funder_party) {
                        if(funder_party.name.indexOf(';')) {
                            let funder_names = funder_party.name.split(';');
                            let funder_ids = funder_party.id.split(';');
                            funder_names.map( (f, i) => {
                                let f_party = JSON.parse(JSON.stringify(funder_party));
                                f_party.name = f;
                                f_party.id = funder_ids[i];
                                computed_contract.parties.push(f_party);
                            } );
                        }
                        else {
                            computed_contract.parties.push(funder_party);
                        }
                    }
                    break;
                case 'awards':
                    computed_contract.awards = [ award ];
                    break;
                case 'contracts':
                    computed_contract.contracts = [ contract ];
                    break;
                case 'source':
                case 'total_amount':
                    // Ignore these properties if present, not part of OCDS
                    break;
                default:
                    computed_contract[x] = record[x];
                    break;
            }
        }
        contracts.push(computed_contract);
    } );

    return contracts;
}

function evaluateFlags(rawRecord, record, flags, partyFields, flagCollectionObj) {
    let contracts = getContractsFromRecord(record);
    let results = [];
    let tempFlags = JSON.stringify(flagCollectionObj);

    // Iterate over all contracts in the document, creating a separate evaluation for each...
    contracts.map( (contract) => {
        let year = getContractYear(contract);
        let contratoFlags = JSON.parse(tempFlags);
        contratoFlags.type = 'contract';

        delete contratoFlags.name;
        delete contratoFlags.entity;

        Object.assign(contratoFlags, { contract_id: contract.contracts[0].id });
        Object.assign(contratoFlags, { ocid: contract.ocid });
        Object.assign(contratoFlags, { id: contract.id });
        Object.assign(contratoFlags, { value: contract.contracts[0].value });

        if( contract.contracts[0].hasOwnProperty('period') ) {
            Object.assign(contratoFlags, { date_signed: new Date(contract.contracts[0].period.startDate) });
        }

        let contratoParties = [];
        contract.parties.map( (party) => {
            var role = party.hasOwnProperty('role')? party.role : party.roles[0];
            var partyObj = {
                id: party.id,
                name: party.name,
                entity: role
            }

            // From the party with a role of "buyer" (Unidad Compradora) we extract its parent (Dependencia) and the state or municipality it belongs to
            if(role == 'buyer') {
                // Get the parent (Dependencia)
                if ( party.hasOwnProperty('memberOf') ) {
                    var dependencyObj = {
                        id: party.memberOf[0].id,
                        entity: 'dependency'
                    }
                    contratoParties.push(dependencyObj);
                    Object.assign( partyObj, { parent: { id: party.memberOf[0].id } } );
                }

                // If the govLevel is "region", extract the state
                // If the govLevel is "city", extract the municipality and the state
                if(party.hasOwnProperty('details') && party.details.hasOwnProperty('govLevel')) {
                    if(party.hasOwnProperty('address') && party.address.hasOwnProperty('countryName')) {
                        let countryCode = laundry.cleanCountry(party.address.countryName);
                        let countryID = laundry.simpleName(countryCode);

                        switch(party.details.govLevel) {
                            case 'region':
                                var stateObj = {
                                    id: countryID + '-' + laundry.simpleName(laundry.launder(party.address.region)),
                                    name: party.address.region,
                                    entity: 'state'
                                }
                                contratoParties.push(stateObj);
                                break;
                            case 'city':
                                var cityStateObj = {
                                    id: countryID + '-' + laundry.simpleName(laundry.launder(party.address.region)),
                                    name: party.address.region,
                                    entity: 'state'
                                }
                                contratoParties.push(cityStateObj);
                                var cityObj = {
                                    id: cityStateObj.id + '-' + laundry.simpleName(laundry.launder(party.address.locality)),
                                    name: party.address.locality,
                                    parent: { id: cityStateObj.id, name: cityStateObj.name },
                                    entity: 'municipality'
                                }
                                contratoParties.push(cityObj);
                                break;
                            case 'country':
                                // Nothing to be done at country level...
                                break;
                        }

                        Object.assign(contratoFlags, { govLevel: party.details.govLevel });
                    }
                }
            }
            if(partyObj) {
                contratoParties.push(partyObj);
            }
        } );

        // Iterate flags
        flags.map( (flag) => {
            let flagScore = getFlagScore(rawRecord, contract, flag);
            contratoFlags.flags[flag.categoryID][flag.id].push({ year: year, score: flagScore });
        } );

        // Add parties to this contract
        Object.assign(contratoFlags, { parties: contratoParties });

        // Get party field values (used by party flags later)
        let contractFields = getContractFields(contract, partyFields);
        Object.assign(contratoFlags.fields, contractFields);

        results.push( { contratoFlags, year, contract: contract } );
    } );

    return results;
}

function evaluateNodeFlags(tree, nodeScores, flags) {
    // let nodeScores = {};
    let roots = tree.roots;
    let globals = tree.globals || {};
    for(var rootID in roots) {
        let branch = roots[rootID];

        // Obtener los IDs parties completos (fuera de los años)
        let ucID = branch.id;
        let dependenciaID = branch.parent_id;
        let supplierIDs = [];
        for(var childID in branch.children) {
            if(childID)
                supplierIDs.push( branch.children[childID].id );
        }

        evaluateNode([ucID], nodeScores, flags, supplierIDs, branch, globals, 'buyer');
        if (dependenciaID) {
            evaluateNode([dependenciaID], nodeScores, flags, supplierIDs, branch, globals, 'buyer');
        }
        evaluateNode(supplierIDs, nodeScores, flags, [ucID], branch.children, globals, 'supplier');

        // Cleanup...
        branch = null;
        roots[rootID] = null;
    }

    return nodeScores;
}

function evaluateNode(nodeIDs, nodeScores, flags, supplierIDs, branch, globals, entity_type) {
    nodeIDs.map(nodeID => {
        if (!nodeScores[nodeID]) {
            console.log("evaluateNode: Uninitialized node",nodeID)
            return;
        }
        nodeScores[nodeID].num_parties++;
        // if(!nodeScores[nodeID].hasOwnProperty('yearsSeen')) nodeScores[nodeID].yearsSeen = [];

        let evaluatedBranch = null;
        if(entity_type == 'supplier') evaluatedBranch = branch[nodeID];
        else evaluatedBranch = branch;
        let branch_years = Object.keys(evaluatedBranch.years);
        let globalData = null;
        if(globals.hasOwnProperty(nodeID)) globalData = globals[nodeID];

        // Iterate flags
        flags.map( (flag) => {
            branch_years.map(year => {
                let flagScore = getNodeFlagScore(nodeScores, flag, supplierIDs, evaluatedBranch, year, globalData, entity_type);
                let cumulativeScore = 0;
                let timesSeen = 0;

                //Add value to party
                nodeScores[nodeID].years.map((yearObj) => {
                    if (yearObj.year == year) {
                        if(!yearObj.hasOwnProperty('node_rules')) yearObj.node_rules = {};

                        // En esta condición, a la bandera se le asigna un valor para ese año cuando no ha sido vista antes,
                        // pero si ya ha sido vista solamente se le asigna un valor si el valor viejo es 1.
                        // De esta manera no es posible pasar a 1 una bandera que estaba en 0, pero sí lo contrario.
                        if(!yearObj.node_rules.hasOwnProperty(flag.id)) {
                            // if(nodeScores[nodeID].yearsSeen.indexOf(year) < 0) nodeScores[nodeID].yearsSeen.push(year);
                            yearObj.node_rules[flag.id] = flagScore;
                            // nodeScores[nodeID].node_rules[flag.id] = accumulativeAverage(nodeScores[nodeID].node_rules[flag.id], nodeScores[nodeID].yearsSeen.length-1, flagScore, 1);
                            // console.log(nodeID, flag.id, nodeScores[nodeID].yearsSeen, year, entity_type, flagScore, nodeScores[nodeID].node_rules[flag.id]);
                        }
                        else if(yearObj.node_rules[flag.id] == 1 && flagScore == 0) yearObj.node_rules[flag.id] = flagScore;
                    }
                    if(flag.type == 'reliability') nodeScores[nodeID].node_rules[flag.id] = accumulativeAverage(nodeScores[nodeID].node_rules[flag.id], nodeScores[nodeID].numParties, flagScore, 1);
                    else if(yearObj.hasOwnProperty('node_rules') && yearObj.node_rules.hasOwnProperty(flag.id)) {
                        cumulativeScore += yearObj.node_rules[flag.id];
                        timesSeen++;
                    }
                });

                // Calculate new average in global node_rules object for this flag
                if(flag.type != 'reliability') nodeScores[nodeID].node_rules[flag.id] = cumulativeScore / timesSeen;
            });
        } );
    });
}

function getNodeFlagScore(nodeScores, flag, supplierIDs, branch, year, globalData, entity_type) {
    switch(flag.flagType) {
        case "reliability":
            // "id": "conf-index",
            return partyGlobalReliability(branch, supplierIDs, year, nodeScores, 'total_score', entity_type);

        case "limited-accumulator-percent":
            // "id": "comp-ncap",
            // "id": "traz-mcr",
                // repeatedAmount(branch,year);
            // "id": "traz-trc",
                // repeatedTitle(branch, year);
            return limitedAccumulatorPercent(branch, year, flag);

        case "limited-party-accumulator-count":
            // "id": "traz-cd",
            return limitedPartyAccumulatorCount(branch, year, flag, globalData);

        case "limited-party-accumulator-percent":
            // "id": "comp-aepc",
                // return predominantEconomicAgentCount(branch,year,flag.field,flag.limit)
            return limitedPartyAccumulatorPercent(branch, year, flag, nodeScores, supplierIDs, entity_type);

        case "limited-party-summer-percent":
            // "id": "comp-aepm",
                // return predominantEconomicAgentAmount(branch,year,flag.field,flag.limit)
            return limitedPartySummerPercent(branch, year, flag, nodeScores, supplierIDs, entity_type);
        default:
            //TODO: Estas falta definir el tipo, son de mexico
            switch(flag.id) {
                case "comp-celp":
                    return tooManyDirectContracts(branch,year);
                case "comp-rla":
                    return overTheLimit(branch,year);
                case "comp-ncap":
                    return aboveAverageContractAmount(branch,year);
                default:
                    console.error("ERROR getNodeFlagScore: Undexpected flag type",flag)
                    process.exit(1)
            }
    }
}


// PARTY FLAG TYPE FUNCTIONS

// ---------- CONFIABILIDAD GLOBAL ----------

// Promediar total_scores de todos los suppliers de esta UC, y calcular confiabilidad para los suppliers en el mismo loop
function partyGlobalReliability(branch, supplierIDs, year, partyScores, flag_field, entity) {
    let supplier_total_score = 0;
    let seenSuppliers = 0;

    // Hay que revisar esta función. Calcularla por año? Calcularla toda de un solo? Si es por año, filtrar suppliers por los que tengan contratos en ese año
    supplierIDs.map( (id) => {
        if(partyScores[id]) {
            partyScores[id].years.map(y => {
                if(y.year == year) {
                    supplier_total_score += y.contract_categories[flag_field];
                    seenSuppliers++;
                }
            })
        }
    } );

    return supplier_total_score / seenSuppliers;
}

function limitedAccumulatorPercent(branch, year, flag) {
    let threshold = flag.limit;
    let minimum_contracts = flag.minimum_contract_count? flag.minimum_contract_count : 0;
    let accumulator_minimum = flag.accumulator_minimum? flag.accumulator_minimum : 0;
    let contract_count = branch.years[year].c_c;
    let result = 1;

    if(contract_count >= minimum_contracts) {
        flag.fields.map( field => {
            let fieldName = flag.id + '_' + field.replace(/\./g, '_');

            Object.keys( branch.years[year][fieldName] ).map( key => {
                let value = branch.years[year][fieldName][key];
                let target = (contract_count * threshold) / 100;
                if(value >= target && value >= accumulator_minimum) result = 0;
            } )
        } );
    }

    return result;
}

function limitedPartyAccumulatorCount(branch, year, flag, globalData) {
    let threshold = flag.limit;
    let result = 1;

    flag.fields.map( field => {
        let fieldName = flag.id + '_' + field.replace(/\./g, '_');
        let count = 0;
        if(flag.global === true) count = Object.keys( globalData[fieldName] ).length;
        else count = Object.keys( branch.years[year][fieldName] ).length;
        if(count > threshold) result = 0;
    } );

    return result;
}

function limitedPartyAccumulatorPercent(branch, year, flag, nodeScores, supplierIDs, entity_type) {
    let threshold = flag.limit;
    let result = 1;
    let contract_count = branch.years[year].c_c;
    let accumulator_minimum = flag.accumulator_minimum? flag.accumulator_minimum : 0;

    if(entity_type == 'supplier') {
        nodeScores[branch.id].years.map( y => {
            if( y.year == year) result = y.node_rules[flag.id];
        } )
        return result;
    }
    else if(entity_type == 'buyer') {
        flag.fields.map( f => {
            let fieldName = flag.id + '_' + f.replace(/\./g, '_');
            supplierIDs.map( supplier => {
                if(branch.children[supplier].years[year]) {
                    let supplier_cc = branch.children[supplier].years[year][fieldName];
                    let target = (contract_count * threshold) / 100;
                    // console.log(branch.id, flag.id, supplier, supplier_cc, contract_count, threshold);
                    if( supplier_cc >= target && supplier_cc >= accumulator_minimum ) {
                        // Asignar el score al supplier
                        nodeScores[supplier].years.map( y => {
                            if(y.year == year) {
                                if( !y.node_rules ) y.node_rules = {};
                                y.node_rules[flag.id] = 0;
                            }
                        } )
                        // Ya encontramos un supplier que rompe la regla
                        result = 0;
                    }
                    nodeScores[supplier].years.map( y => {
                        if(y.year == year) {
                            if( !y.node_rules ) y.node_rules = {};
                            y.node_rules[flag.id] = result;
                        }
                    } );
                }
            } );
        } );
    }

    return result;
}

function limitedPartySummerPercent(branch, year, flag, nodeScores, supplierIDs, entity_type) {
    let threshold = flag.limit;
    let result = 1;
    let contract_amount = branch.years[year].c_a;

    if(entity_type == 'supplier') {
        nodeScores[branch.id].years.map( y => {
            if( y.year == year) result = y.node_rules[flag.id];
        } )
        return result;
    }
    else if(entity_type == 'buyer') {
        flag.fields.map( f => {
            let fieldName = flag.id + '_' + f.replace(/\./g, '_');
            supplierIDs.map( supplier => {
                if(branch.children[supplier].years[year]) {
                    let supplier_ca = branch.children[supplier].years[year][fieldName];
                    if( supplier_ca > (contract_amount * threshold) ) {
                        // Asignar el score al supplier
                        nodeScores[supplier].years.map( y => {
                            if(y.year == year) {
                                if( !y.node_rules ) y.node_rules = {};
                                y.node_rules[flag.id] = 0;
                            }
                        } )
                        // Ya encontramos un supplier que rompe la regla
                        result = 0;
                    }
                    nodeScores[supplier].years.map( y => {
                        if(y.year == year) {
                            if( !y.node_rules ) y.node_rules = {};
                            y.node_rules[flag.id] = result;
                        }
                    } );
                }
            } );
        } );

        return result;
    }

    return result;
}


// OLD PARTY FLAG FUNCTIONS


// ---------- CONFIABILIDAD POR AÑOS ----------
function yearlyReliability_____NOSE() {
    let years_seen = 0;
    let aepm_acc = 0;
    let aepc_acc = 0;
    let tcr10_acc = 0;
    let mcr10_acc = 0;
    let celp_acc = 0;
    let rla_acc = 0;
    let ncap3_acc = 0;
    for(var year in branch.years) {
        years_seen++;

        let year_scores_avg = getSupplierYearScores(supplierIDs, partyScores, year);
        let uc_year_score = getBuyerYearScore(ucID, partyScores, year);

        // UC
        if( !nodeScores[ucID].years[year] ) {
            nodeScores[ucID].years[year] = {
                nodeScore: {
                    conf: year_scores_avg.score,
                    aepm: { score:0 },
                    aepc: { score:0 },
                    tcr10: { score:0 },
                    mcr10: { score:0 },
                    celp: { score:0 },
                    rla: { score:0 },
                    ncap3: { score:0 }
                },
                numParties: year_scores_avg.count
            }
        }
        else {
            nodeScores[ucID].years[year].nodeScore.conf = accumulativeAverage(nodeScores[ucID].years[year].nodeScore.conf, nodeScores[ucID].years[year].numParties, year_scores_avg.score, year_scores_avg.count);
            nodeScores[ucID].years[year].numParties += year_scores_avg.count;
        }

        // Suppliers
        year_scores_avg.suppliers.map( (id) => {
            if( !nodeScores[id].years[year] ) {
                nodeScores[id].years[year] = {
                    nodeScore: { conf: uc_year_score },
                    numParties: 1
                }
            }
            else {
                nodeScores[id].years[year].nodeScore.conf = accumulativeAverage(nodeScores[id].years[year].nodeScore.conf, nodeScores[id].years[year].numParties, uc_year_score, 1);
                nodeScores[id].years[year].numParties++;
            }
        } );

        let seen = false;
    }
}

// ---------- AGENTE ECONOMICO PREPONDERANTE (MONTO) ----------
function predominantEconomicAgentAmount(branch,year) {

    let aepm_threshhold = 0.5; // More than aepm_threshhold % of contract amounts to same supplier
    let supplier_year_amounts = getSupplierYearAmounts(branch, year);
    let buyer_year_total = branch.years[year].c_a;

    let score_object = { score: 1 };
    if(supplier_year_amounts.length > 0) {
        supplier_year_amounts.map( (s) => {
            if(s.amount >= buyer_year_total * aepm_threshhold) {
                score_object = {
                    supplier: s.id,
                    value: s.amount / buyer_year_total,
                    score: 0
                };
            }
        } );
    }

    return score_object.score;
}
// ---------- AGENTE ECONOMICO PREPONDERANTE (CANTIDAD) ----------
function predominantEconomicAgentCount(branch,year) {

    let aepc_threshhold = 0.5; // More than aepm_threshhold % of contract amounts to same supplier
    let supplier_year_counts = getSupplierYearCounts(branch, year);
    let buyer_year_count = branch.years[year].c_c;

    let result = { score: 1 };
    if(supplier_year_counts.length > 0) {
        seen = false;
        supplier_year_counts.map( (s) => {
            if(s.count >= buyer_year_count * aepc_threshhold) {
                result = {
                    supplier: s.id,
                    value: s.count / buyer_year_count,
                    score: 0
                };
                seen = true;
            }
        } );
        // if(!seen) aepc_acc++;
    }

    return result.score;
}
// ---------- TITULO DE CONTRATO REPETIDO ----------
function repeatedTitle(branch,year) {

    let tcr10_threshhold = 0.1;
    let buyer_year_title_count = branch.years[year].c_c;

    seen = false;
    let result = { score: 1 };
    if(buyer_year_title_count > 10) {
        for(var t in branch.years[year].titles) {
            if( branch.years[year].titles[t] >= buyer_year_title_count * tcr10_threshhold ) {
                result = {
                    title: t,
                    value: branch.years[year].titles[t] / buyer_year_title_count,
                    score: 0
                };
                seen = true;
            }
        }
    }
    // if(!seen) tcr10_acc++;

    return result.score;
}
// ---------- MONTO DE CONTRATO REPETIDO ----------
function repeatedAmount(branch,year) {

    let mcr10_threshhold = 0.1;
    let buyer_year_amount_count = branch.years[year].c_c;

    seen = false;
    let result = { score: 1 };
    if(buyer_year_amount_count > 10) {
        for(var a in branch.years[year].amounts) {
            if( branch.years[year].amounts[a] >= buyer_year_amount_count * mcr10_threshhold ) {
                result = {
                    amount: a,
                    value: branch.years[year].amounts[a] / buyer_year_amount_count,
                    score: 0
                };
                seen = true;
            }
        }
    }
    // if(!seen) mcr10_acc++;

    return result.score;
}

// ---------- CONCENTRACION DE EXCEPCIONES A LICITACION PUBLICA ----------
function tooManyDirectContracts(branch,year) {
    let celp_threshhold = 0.333;
    let supplier_year_direct_amounts = getSupplierYearDirectAmounts(branch, year);
    let buyer_year_direct_total = branch.years[year].direct.c_a;

    let result = { score: 1 };
    seen = false;
    if(supplier_year_direct_amounts.length > 0 && buyer_year_direct_total > 0) {
        supplier_year_amounts.map( (s) => {
            if(s.amount >= buyer_year_direct_total * celp_threshhold) {
                result = {
                    supplier: s.id,
                    value: s.amount / buyer_year_direct_total,
                    score: 0
                };
                seen = true;
            }
        } );
    }
    // if(!seen) celp_acc++;

    return result.score;
}


// ---------- REBASA EL LIMITE ASIGNADO ----------
function overTheLimit(branch,year) {

    let rla_threshhold = 0.3;
    let result = { score: 1 };
    let buyer_year_direct_total = branch.years[year].direct.c_a;

    if(buyer_year_direct_total > branch.years[year].c_a * rla_threshhold) {
        result = {
            value: buyer_year_direct_total / branch.years[year].c_a,
            score: 0
        };
    }
    else {
        // rla_acc++;
    }

    return result.score;
}

// ---------- NUMERO DE CONTRATOS ARRIBA DEL PROMEDIO ----------
function aboveAverageContractAmount(branch,year) {

    let ncap3_threshhold = 0.03;
    let buyer_year_count = branch.years[year].c_c;

    seen = false;
    let result  = { score: 1 };
    if(buyer_year_count > 10) {
        for(var d in branch.years[year].dates) {
            if(branch.years[year].dates[d] >= buyer_year_count * ncap3_threshhold) {
                result = {
                    date: d,
                    value: branch.years[year].dates[d] / buyer_year_count,
                    score: 0
                };
                seen = true;
            }
        }
    }
    // if(!seen) ncap3_acc++;
    return result.score;
}

// OLD PARTY FLAG HELPER FUNCTIONS
//TODO: Reemplazar con funciones más abstractas

function getSupplierYearDirectAmounts(branch, year) {
    let amounts = [];
    for(var s in branch.children) {
        let supplier = branch.children[s];
        for(var s_year in supplier.years) {
            if(s_year == year)
                amounts.push( { id: supplier.id, amount: supplier.years[s_year].direct.c_a } );
        }
    }
    return amounts;
}

function getSupplierYearAmounts(branch, year) {
    let amounts = [];
    for(var s in branch.children) {
        let supplier = branch.children[s];
        for(var s_year in supplier.years) {
            if(s_year == year)
                amounts.push( { id: supplier.id, amount: supplier.years[s_year].c_a } );
        }
    }
    return amounts;
}

function getSupplierYearCounts(branch, year) {
    let counts = [];
    for(var s in branch.children) {
        let supplier = branch.children[s];
        for(var s_year in supplier.years) {
            if(s_year == year)
                counts.push( { id: supplier.id, count: supplier.years[s_year].c_c } );
        }
    }
    return counts;
}

function getBuyerYearScore(id, partyScores, year) {
    let score = 0;
    if(partyScores[id]) {
        partyScores[id].years.map( (b_year) => {
            if(b_year.year == year) {
                score = b_year.contract_categories.total_score;
            }
        } );
    }

    return score;
}

function getSupplierYearScores(supplierIDs, partyScores, year) {
    let total_score = 0;
    let num_suppliers = 0;
    let year_ids = [];

    supplierIDs.map( (id) => {
        if(partyScores[id]) {
            partyScores[id].years.map( (s_year) => {
                if(s_year.year == year) {
                    total_score += s_year.contract_categories.total_score;
                    num_suppliers++;
                    year_ids.push(id);
                }
            } );
        }
    } );

    return { score: total_score / num_suppliers, count: num_suppliers, suppliers: year_ids };
}

module.exports = { evaluateFlags, evaluateNodeFlags };





        // Promedios globales por banderas de nodo para la UC
        // nodeScores[ucID].nodeScore.aepm = aepm_acc / years_seen;
        // nodeScores[ucID].nodeScore.aepc = aepc_acc / years_seen;
        // nodeScores[ucID].nodeScore.tcr10 = tcr10_acc / years_seen;
        // nodeScores[ucID].nodeScore.mcr10 = mcr10_acc / years_seen;
        // nodeScores[ucID].nodeScore.celp = celp_acc / years_seen;
        // nodeScores[ucID].nodeScore.rla = rla_acc / years_seen;
        // nodeScores[ucID].nodeScore.ncap3 = ncap3_acc / years_seen;

        // if(dependenciaID) {
        //     // Promedios globales por banderas de nodo para la dependencia
        //     nodeScores[dependenciaID].nodeScore.aepm = accumulativeAverage(nodeScores[dependenciaID].nodeScore.aepm, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.aepm, 1);
        //     nodeScores[dependenciaID].nodeScore.aepc = accumulativeAverage(nodeScores[dependenciaID].nodeScore.aepc, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.aepc, 1);
        //     nodeScores[dependenciaID].nodeScore.tcr10 = accumulativeAverage(nodeScores[dependenciaID].nodeScore.tcr10, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.tcr10, 1);
        //     nodeScores[dependenciaID].nodeScore.mcr10 = accumulativeAverage(nodeScores[dependenciaID].nodeScore.mcr10, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.mcr10, 1);
        //     nodeScores[dependenciaID].nodeScore.celp = accumulativeAverage(nodeScores[dependenciaID].nodeScore.celp, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.celp, 1);
        //     nodeScores[dependenciaID].nodeScore.rla = accumulativeAverage(nodeScores[dependenciaID].nodeScore.rla, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.rla, 1);
        //     nodeScores[dependenciaID].nodeScore.ncap3 = accumulativeAverage(nodeScores[dependenciaID].nodeScore.ncap3, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.ncap3, 1);
        //     nodeScores[dependenciaID].numParties++;
        // }


    // if(dependenciaID) {
    //     // Dependencia
    //     if( !nodeScores[dependenciaID].years[year] ) {
    //         nodeScores[dependenciaID].years[year] = {
    //             nodeScore: {
    //                 conf: nodeScores[ucID].years[year].nodeScore.conf,
    //                 aepm: nodeScores[ucID].years[year].nodeScore.aepm.score,
    //                 aepc: nodeScores[ucID].years[year].nodeScore.aepc.score,
    //                 tcr10: nodeScores[ucID].years[year].nodeScore.tcr10.score,
    //                 mcr10: nodeScores[ucID].years[year].nodeScore.mcr10.score,
    //                 celp: nodeScores[ucID].years[year].nodeScore.celp.score,
    //                 rla: nodeScores[ucID].years[year].nodeScore.rla.score,
    //                 ncap3: nodeScores[ucID].years[year].nodeScore.ncap3.score
    //             },
    //             numParties: 1
    //         }
    //     }
    //     else {
    //         nodeScores[dependenciaID].years[year].nodeScore.conf = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.conf, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.conf, 1);
    //         nodeScores[dependenciaID].years[year].nodeScore.aepm = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.aepm, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.aepm.score, 1);
    //         nodeScores[dependenciaID].years[year].nodeScore.aepc = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.aepc, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.aepc.score, 1);
    //         nodeScores[dependenciaID].years[year].nodeScore.tcr10 = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.tcr10, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.tcr10.score, 1);
    //         nodeScores[dependenciaID].years[year].nodeScore.mcr10 = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.mcr10, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.mcr10.score, 1);
    //         nodeScores[dependenciaID].years[year].nodeScore.celp = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.celp, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.celp.score, 1);
    //         nodeScores[dependenciaID].years[year].nodeScore.rla = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.rla, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.rla.score, 1);
    //         nodeScores[dependenciaID].years[year].nodeScore.ncap3 = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.ncap3, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.ncap3.score, 1);
    //         nodeScores[dependenciaID].years[year].numParties++;
    //     }
    // }
