function createOrgTree() {
    return {
        roots: {}
    }
}

function updateOrgTree(tree, contract, parties, party_rules) {
    // Data from contracts:
    //      dependencyID
    //      ucID
    //      procmethod
    //      funders[]
    //          id
    //      suppliers[]
    //          id
    //          contract
    //              year
    //              date
    //              title
    //              amount
    let roots = tree.roots;
    if(!tree.hasOwnProperty('globals')) tree.globals = {};
    let globals = tree.globals;
    let data = extractDataFromContract(contract);
    // TODO: refactor
    // Funders and buyer in the same roots array
    // Check received parties for contract to add state and municipality to roots array

    // Get UC or create it if not seen yet
    if(!branchExists(roots, data.ucID)) addBranch(roots, data.ucID, data.dependencyID, data);
    let branch = roots[data.ucID];

    // Get funders if they exist
    let f_branches = [];
    if(data.funders.length > 0) {
        data.funders.map( (funder) => {
            if(!branchExists(roots, funder)) addBranch(roots, funder, null);
            f_branches.push(roots[funder]);
        } );
    }
    // Get states and municipalities if they exist
    parties.map( (party) => {
        // console.log('parties.map', branch.id, party.entity, party)
        if(party.entity == 'state') {
            if(!branchExists(roots, party.id)) addBranch(roots, party.id, null);
            f_branches.push(roots[party.id]);
        }
        else if(party.entity == 'municipality') {
            // Add the city level|
            if(!branchExists(roots, party.id)) addBranch(roots, party.id, party.parent.id);
            f_branches.push(roots[party.id]);
            // Add the region level
            if(!branchExists(roots, party.parent.id)) addBranch(roots, party.parent.id, null);
            f_branches.push(roots[party.parent.id]);
        }
    } );

    // Get suppliers
    data.suppliers.map( (supplier) => {
        if( !leafExists(branch, supplier.id) )
            addLeafToBranch(branch, supplier.id); // Create supplier node if it does not exist yet
        let leaf = branch.children[supplier.id];
        f_branches.map( (f) => {
            if( !leafExists(f, supplier.id) )
                addLeafToBranch(f, supplier.id); // Create supplier node if it does not exist yet for funder
        } );

        let year_index = supplier.contract.year.toString();
        if( !leaf.years[year_index] )
            leaf.years[year_index] = newYearObj(); // Initialize year object for supplier if not seen yet
        if( !branch.years[year_index] )
            branch.years[year_index] = newYearObj(); // Initialize year object for buyer if not seen yet
        f_branches.map( (f) => {
            if( !f.years[year_index] )
                f.years[year_index] = newYearObj(); // Initialize year object for funders if not seen yet
            if( !f.children[supplier.id].years[year_index] )
                f.children[supplier.id].years[year_index] = newYearObj(); // Initialize year object for funder supplier if not seen yet
        } );

        // Update contract count and amount for this buyer
        branch.years[year_index].c_c++;
        branch.years[year_index].c_a += parseFloat(supplier.contract.amount);
        // Update contract count and amount for this supplier
        leaf.years[year_index].c_c++;
        leaf.years[year_index].c_a += parseFloat(supplier.contract.amount);
        // Update contract count and amount for funders
        f_branches.map( (f) => {
            f.years[year_index].c_c++;
            f.years[year_index].c_a += parseFloat(supplier.contract.amount);
            // Update contract count and amount for this supplier
            f.children[supplier.id].years[year_index].c_c++;
            f.children[supplier.id].years[year_index].c_a += parseFloat(supplier.contract.amount);
        } );

        // For each party flag:
        // - Get relevant party fields from party flags
        party_rules.map( rule => {
            // - According to flag, accumulate in the proper way
            // - - First for buyer
            updatePartyFlagData(globals, branch.id, branch.years[year_index], supplier.contract.source, rule);
            // - - Then for supplier
            updatePartyFlagData(globals, leaf.id, leaf.years[year_index], supplier.contract.source, rule);
            // - - Finally for funders/areas
            f_branches.map( (f) => {
                updatePartyFlagData(globals, f.id, f.years[year_index], supplier.contract.source, rule);
                // Update contract count and amount for this supplier
                updatePartyFlagData(globals, f.children[supplier.id].id, f.children[supplier.id].years[year_index], supplier.contract.source, rule);
            } );
        } );

        branch.children[supplier.id] = leaf;
    } );

    roots[data.ucID] = branch;
}


/* ------------------------------------------------------------------------------- */
/* ------------------------------ PRIVATE FUNCTIONS ------------------------------ */
/* ------------------------------------------------------------------------------- */

function extractDataFromContract(contract) {
    let dependency_id = '';
    let uc_id = '';
    let proc_method = ""; // TODO: get contract.tender.procurementMethod for contract_flags
    let suppliers = [];
    let funders = [];

    // console.log(contract)

    contract.parties.map( (p) => {
        let role = p.entity;
        if(role == 'buyer') {
            uc_id = p.id;
            // dependency_id = p.memberOf[0].id;
        }
        if(role == 'funder') {
            funders.push(p.id);
        }
        if(role == 'supplier') {
            let date = contract.hasOwnProperty('date_signed')? contract.date_signed : contract.period.startDate;
            let date_parts = processDate(date);
            let c_summary = {
                year: date_parts[0].toString(),
                date: date_parts[1] + '-' + date_parts[2],
                id: contract.id,
                amount: parseFloat(contract.value.amount),
                source: contract
            }
            suppliers.push( { id: p.id, contract: c_summary } );
        }
    } );

    return {
        dependencyID: dependency_id,
        ucID: uc_id,
        procmethod: proc_method,
        suppliers: suppliers,
        funders: funders
    }
}

function getSupplierIDs(awards, awardID) {
    let award = awards.filter( (a) => a.id == awardID );
    return award[0].suppliers;
}

function updatePartyFlagData(globals, nodeID, node, data, rule) {
    switch(rule.flagType) {
        case 'limited-party-summer-percent':
            rule.fields.map( f => {
                let fieldName = rule.id + '_' + f.replace(/\./g, '_');
                let value = 0;
                if(fieldName == rule.id + '_' + 'contracts_value_amount') value = data.value.amount;
                else value = data.fields[f.replace(/\./g, '_')];
                if(!node.hasOwnProperty(fieldName)) {
                    node[fieldName] = value;
                }
                else node[fieldName] += value;
            } );
            break;
        case 'limited-party-accumulator-percent':
            rule.fields.map( f => {
                let fieldName = rule.id + '_' + f.replace(/\./g, '_');
                if(!node.hasOwnProperty(fieldName)) {
                    node[fieldName] = 1;
                }
                else node[fieldName] += 1;
            } );
            break;
        case 'limited-party-accumulator-count':
        case 'limited-accumulator-percent':
            rule.fields.map( f => {
                let fieldName = rule.id + '_' + f.replace(/\./g, '_');
                let value = '';
                if(fieldName == rule.id + '_' + 'contracts_value_amount') value = data.value.amount;
                else if(fieldName == rule.id + '_' + 'contracts_period_startDate') value = data.fields[f.replace(/\./g, '_')].split('T')[0];
                else value = data.fields[f.replace(/\./g, '_')];
                if(!node.hasOwnProperty(fieldName)) node[fieldName] = {};
                if(!node[fieldName].hasOwnProperty(value)) node[fieldName][value] = 0;
                node[fieldName][value]++;
                // Check if value should be accumulated globally
                if(rule.global === true) {
                    if(!globals.hasOwnProperty(nodeID)) globals[nodeID] = {};
                    if(!globals[nodeID].hasOwnProperty(fieldName)) globals[nodeID][fieldName] = {};
                    if(!globals[nodeID][fieldName].hasOwnProperty(value)) globals[nodeID][fieldName][value] = 0;
                    globals[nodeID][fieldName][value]++;
                }
            } );
            break;
    }
}

function addBranch(roots, branch_id, parent_id) {
    roots[branch_id] = {
        id: branch_id,
        parent_id: parent_id,
        children: {},
        years: {}
    }
}

function addLeafToBranch(branch, child_id) {
    branch.children[child_id] = {
        id: child_id,
        years: {}
    }
}

function newYearObj() {
    return {
        c_c: 0,
        c_a: 0,
        // titles: {},
        // amounts: {},
        // dates: {},
        // direct: {
        //     c_c: 0,
        //     c_a: 0
        // }
    }
}

function branchExists(roots, branch_id) {
    if( roots[branch_id] ) return true;
    else return false;
}

function leafExists(branch, leaf_id) {
    if( branch[leaf_id] ) return true;
    else return false;
}

function processDate(date) {
    if(isDate(date)) date_str = date.toISOString();
    else date_str = date;

    if(date_str.indexOf('T')) dayDate = date_str.split('T')[0];
    else dayDate = date_str;

    let date_parts = dayDate.split(/[\/-]/);
    return date_parts;
}

function isDate(d) {
    if(!d) return false;
    return typeof d.toISOString === "function";
}

module.exports = { createOrgTree, updateOrgTree }
