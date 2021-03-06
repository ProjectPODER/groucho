const hash = require('object-hash');

function createFlagCollectionObject(id, flags) {
    let flagCollObj = {
        ruleset_id: id,
        id: '',
        name: '',
        type: '', // Values: contract, party
        entity: '',
        flags: {},
        fields: {}
    };

    flags.map( (flag) => {
        if( !flagCollObj.flags.hasOwnProperty(flag.categoryID) ) {
            flagCollObj.flags[flag.categoryID] = {};
        }

        flagCollObj.flags[flag.categoryID][flag.id] = [];
    } );

    return flagCollObj;
}

function findObjectInCollection(id, collection) {
    if( collection[id] ) {
        return collection[id];
    }
    else {
        return -1;
    }
}

function updateFlagCollection(party, collection, evaluation, flags) {
    var obj = findObjectInCollection(party.id, collection);
    var year = evaluation.date_signed.substr(0,4);
    var flags = evaluation.rules_score;
    if(obj == -1) { // Party hasn't been seen yet
        let newObj = {};

        newObj.id = party.id;
        newObj.name = party.name;
        newObj.ruleset_id = evaluation.ruleset_id;
        newObj.type = 'party';
        newObj.entity = party.entity;
        if(party.entity == 'buyer') {
            newObj.govLevel = evaluation.govLevel;
            evaluation.parties.map( sibling => {
                if(sibling.entity == 'state' || sibling.entity == 'municipality') {
                    newObj[sibling.entity] = sibling.id;
                }
            } );
            // console.log('new object from evaluation', newObj);
        }
        if(party.hasOwnProperty('parent')) {
            newObj.parent = party.parent;
        }

        newObj.flags = {};
        Object.keys(JSON.parse(JSON.stringify(flags))).map((key) => {
            Object.keys(flags[key]).map( (subkey) => {
                if (!newObj.flags[key]) { newObj.flags[key] = {} };
                if (!newObj.flags[key][subkey]) { newObj.flags[key][subkey] = [] };
                newObj.flags[key][subkey].push({ score: flags[key][subkey], year: year });
            })
        });
        newObj.contract_count = [];
        newObj.contract_count.push({ year: year, count: 1, amount: evaluation.value.amount });

        collection[party.id] = newObj;
    }
    else {
        if(obj.contract_count.filter( function(item) { return item.year == year } ).length == 0) {
            // Contracts for this party and this year have not been seen yet
            obj.contract_count.push({ year: year, count: 1, amount: evaluation.value.amount });

            // Iterate over flag categories and then flags
            Object.keys(flags).map( function(key, index) {
                Object.keys(flags[key]).map( function(subkey, subindex) {
                    // Get flag score for current flag in current contract year
                    var year_flag = {score: flags[key][subkey]};
                    obj.flags[key][subkey].push( { year: year, score: year_flag.score } );
                } );
            } );
        }
        else {
            // Party has contracts in this year already
            Object.keys(flags).map( function(key, index) {
                Object.keys(flags[key]).map( function(subkey, subindex) {
                    // Get value to be averaged with current average
                    var new_value = flags[key][subkey];
                    // Get current average
                    // console.log("updateFlagCollection old_value",key,obj.flags)
                    var old_value = obj.flags[key][subkey].filter( function(item) { return item.year == year } )[0].score;
                    // Get contract_count for current year
                    var contract_count = obj.contract_count.filter( function(item) { return item.year == year } )[0].count;

                    // Y ahora, aplicamos la f??rmula m??gica! (Kept in Spanish for now)
                    //      new_score = ( (old_value * contract_count) + new_value ) / (contract_count + 1)
                    // Para mantener el promedio, multiplicamos la cantidad de contratos promediados por el valor promedio
                    // y luego sumamos el nuevo valor al promedio expandido, para finalmente dividir por la cantidad
                    // nueva de contratos (contract_count + 1).
                    var new_score = ((old_value * contract_count) + new_value) / (contract_count + 1);
                    obj.flags[key][subkey].map( (item) => {
                        if(item.year == year) item.score = new_score;
                        return item;
                    } );
                } );
            } );

            // Don't forget: increase contract_count after contract has been processed
            obj.contract_count.map( (item) => {
                if(item.year == year) {
                    item.count += 1;
                    item.amount += evaluation.value.amount
                }
                return item;
            } );
        }
    }
}

function getContractCriteriaSummary(collection, criteriaObj, ruleset_id) {
    let summary = [];
    let tempCriteriaObj = JSON.stringify(criteriaObj);

    collection.map( (evaluation) => {
        let item = evaluation.hasOwnProperty('contratoFlags')? evaluation.contratoFlags : evaluation;
        let contractFlagObj = {
            id: item.id + '-' + item.contract_id,
            ocid: item.ocid,
            ruleset_id: ruleset_id,
            date_signed: item.hasOwnProperty('date_signed')? item.date_signed : null,
            govLevel: item.hasOwnProperty('govLevel')? item.govLevel : null,
            parties: item.parties,
            value: item.value,
            fields: item.fields
        };

        item.parties.map( party => {
            let partyBaseObj = {
                id: party.id,
                name: party.name
            }
            if(party.parent)
                Object.assign(partyBaseObj, { parent: party.parent })
            contractFlagObj[party.entity] = partyBaseObj;
        } );

        let contract_score = JSON.parse(tempCriteriaObj);

        Object.assign(contractFlagObj, { contract_score });
        Object.assign(contractFlagObj, { rules_score: {} });

        // Iterate flag categories
        Object.keys(item.flags).map( function(categoria, index) {
            var flagCount = 0;
            contractFlagObj.rules_score[categoria] = {};

            // Iterate flags
            Object.keys(item.flags[categoria]).map( function(bandera, subindex) {
                contractFlagObj.rules_score[categoria][bandera] = item.flags[categoria][bandera][0].score;
                contractFlagObj.contract_score[categoria] += item.flags[categoria][bandera][0].score || 0;
                flagCount++;
            } );

            contractFlagObj.contract_score[categoria] /= flagCount;
        } );

        // Calculate the global total_score
        var global_total = 0;
        var num_categorias = 0;
        Object.keys(contractFlagObj.contract_score).map( function(cat, index) {
            if(cat != 'total_score') {
                global_total += contractFlagObj.contract_score[cat];
                num_categorias++;
            }
        } );
        contractFlagObj.contract_score.total_score = global_total / num_categorias;

        summary.push(contractFlagObj);
    } );

    return summary;
}

function getPartyCriteriaSummary(collection, criteriaObj) {
    let summary = [];
    let tempCriteriaObj = JSON.stringify(criteriaObj);

    collection.map( (item) => {
        let party = {
            id: item.id,
            name: item.name,
            type: item.entity,
            contract_count: 0,
            contract_amount: 0
        };
        if(party.type == 'buyer') {
            party.govLevel = item.govLevel;
            if(item.hasOwnProperty('state')) Object.assign(party, { state: item.state });
            if(item.hasOwnProperty('municipality')) Object.assign(party, { municipality: item.municipality });
        }
        if(item.hasOwnProperty('parent')) {
            Object.assign( party, { parent: item.parent } )
        }

        // Assign contract count and amount to flag object
        item.contract_count.map( year => {
            party.contract_count += year.count;
            party.contract_amount += year.amount;
        } );

        let contract_score = JSON.parse(tempCriteriaObj);
        let years = [];
        let partyFlagObj = {
            ruleset_id: item.ruleset_id,
            party,
            contract_score,
            contract_rules: {},
            years
        };

        // Iterate categories
        Object.keys(item.flags).map( function(categoria, index) {
            var flagCount = 0;
            //partyFlagObj.rules_score[categoria] = {};

            // Iterate flags
            Object.keys(item.flags[categoria]).map( function(bandera, subindex) {
                var scoreCount = 0;
                var scoreSum = 0;
                partyFlagObj.contract_rules[bandera] = {};

                // Iterate years with a score for the flag
                item.flags[categoria][bandera].map( (score) => {
                    if( partyFlagObj.years.filter( (yearObj) => { return yearObj.year == score.year } ).length == 0 ) {
                        let criteriaYearObj = {
                            year: score.year,
                            contract_categories: JSON.parse(tempCriteriaObj),
                            contract_rules: {}
                        }
                        partyFlagObj.years.push(criteriaYearObj);
                    }


                    partyFlagObj.years.map( (yearObj) => {
                        if(yearObj.year == score.year) {
                            // console.log("item partyFlagObj.years",yearObj.contract_score[categoria])
                            yearObj.contract_categories[categoria] += score.score;
                            // if( !yearObj.rules_score[categoria] ) yearObj.rules_score[categoria] = {};
                            yearObj.contract_rules[bandera] = score.score;
                            scoreSum += score.score;
                        }
                    } );
                    scoreCount++;
                } );

                // Calculate average of all year scores for each individual rule score
                partyFlagObj.contract_rules[bandera] = scoreSum / scoreCount;

                flagCount++;
            } );

            // Calculate averages for this category and this year
            partyFlagObj.years.map( (yearObj) => {
                // console.log("partyFlagObj.years",yearObj)
                yearObj.contract_categories[categoria] /= flagCount;
                partyFlagObj.contract_score[categoria] += yearObj.contract_categories[categoria];
            } );

            // console.log("getPartyCriteriaSummary",partyFlagObj.contract_score,categoria,partyFlagObj.contract_score[categoria],partyFlagObj.years.length)
            partyFlagObj.contract_score[categoria] /= partyFlagObj.years.length;
        } );

        // Calculate total_scores per year
        partyFlagObj.years.map( (yearObj) => {
            var year_total = 0;
            var num_categorias = 0;
            Object.keys(yearObj.contract_categories).map( function(cat, index) {
                if(cat != 'total_score') {
                    year_total += yearObj.contract_categories[cat];
                    num_categorias++;
                }
            } );
            yearObj.contract_categories.total_score = year_total / num_categorias;
        } )

        // Calculate contract total_score
        var global_total = 0;
        var num_categorias = 0;
        Object.keys(partyFlagObj.contract_score).map( function(cat, index) {
            if(cat != 'total_score') {
                global_total += partyFlagObj.contract_score[cat];
                num_categorias++;
            }
        } );
        partyFlagObj.contract_score.total_score = global_total / num_categorias;

        summary.push(partyFlagObj);
    } );

    return summary;
}

function getPartyNodeSummary(collection, nodeScores) {
    let summary = [];
    collection.map( (item) => {
        if(nodeScores[item.party.id]) {
            let node_score = nodeScores[item.party.id];

            // console.log(item,node_score);
            let category_acc = {};
            for (let rule_index in Object.keys(node_score.node_rules)) {
                let rule = Object.keys(node_score.node_rules)[rule_index];
                let category = rule.split("-")[0];
                if (!category_acc[category]) {
                    category_acc[category]={
                        value: 0,
                        count: 0
                    }
                }
                category_acc[category].value += node_score.node_rules[rule];
                category_acc[category].count++;
            }
            for (category_index in Object.keys(category_acc)) {
                let category = Object.keys(category_acc)[category_index];
                item.node_categories[category] = category_acc[category].value / category_acc[category].count;
            }

            //TODO: Hardcoded category names
            item.node_categories.total_score = (item.node_categories.comp + item.node_categories.traz) / 2 ;

            item.category_score = { // TODO: tal vez quitar esto
                comp: (item.contract_categories.comp + item.node_categories.comp) / 2,
                traz: (item.contract_categories.traz + item.node_categories.traz) / 2,
            };

            item.total_score = (item.contract_categories.total_score + item.node_categories.total_score) / 2;

            //TODO: Review years here
            // Assign each node_score object to each evaluated year
            let item_years_count = 0;
            let item_years_node_rules = 0;
            item.years.map( (year) => {
                // console.log("getPartyNodeSummary",year);
                node_score.years.map( node_year => {
                    if(node_year.year == year.year && node_year.node_rules) {
                        let year_node_scores_sum = 0;
                        let year_node_scores_count = 0;
                        Object.keys(node_year.node_rules).map( (x) => {
                            year_node_scores_sum += node_year.node_rules[x];
                            year_node_scores_count++;
                        } );
                        let year_node_total_score = year_node_scores_sum / year_node_scores_count;
                        Object.assign( node_year.node_rules, { 'total_score': year_node_total_score } );
                        Object.assign( year, { 'node_rules': node_year.node_rules } );
                        item_years_count++;
                        item_years_node_rules += year_node_total_score;

                        let year_category_acc = {};
                        if(!year.node_categories) year.node_categories = {}
                        for (let rule_index in Object.keys(node_year.node_rules)) {
                            let rule = Object.keys(node_year.node_rules)[rule_index];
                            let category = rule.split("-")[0];
                            if (!year_category_acc[category]) {
                                year_category_acc[category]={
                                    value: 0,
                                    count: 0
                                }
                            }
                            year_category_acc[category].value += node_year.node_rules[rule];
                            year_category_acc[category].count++;
                        }
                        for (category_index in Object.keys(year_category_acc)) {
                            let category = Object.keys(year_category_acc)[category_index];
                            year.node_categories[category] = year_category_acc[category].value / year_category_acc[category].count;
                        }

                    }
                } );
            } );
            item.node_rules.total_score = item_years_node_rules / item_years_count;
        }
        else {
            console.log('Node score not found:', item.party.id);
        }

        summary.push(item);
    } );

    return summary;
}

// Receives a chunk of an object collection, adds a hash to ensure uniqueness of id, and inserts in bulk to DB
// Array flagCollection: the chunk of objects to send to DB
// Object dbCollection: the DB collection object that the chunk is sent to
function sendCollectionToDB(flagCollection, dbCollection) {
    const operations = [];

    flagCollection.map( (flag) => {
        let flagHash = hash(flag);
        Object.assign(flag, { _id: flagHash });
        operations.push( { insertOne: { document: flag } } );
    } );
    return dbCollection.bulkWrite(operations, { ordered:true });
}

module.exports = {
    createFlagCollectionObject,
    updateFlagCollection,
    getPartyNodeSummary,
    getPartyCriteriaSummary,
    getContractCriteriaSummary,
    sendCollectionToDB
};
