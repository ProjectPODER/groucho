const {
    isEmpty,
    isObject,
    isArray,
    isString,
    isNumeric,
    isDate,
    fieldPathExists,
    makeUnique,
    evaluateConditions,
    evaluateDateCondition
} = require('./util');

function direccionProveedor(contract) {
    // Get the supplier country
    let supplierCountry = '';
    let supplierIndex = -1;
    if(contract.parties.length > 0) {
        contract.parties.map( (party, i) => {
            if(party.hasOwnProperty('roles') && party.roles.length > 0) {
                party.roles.map( role => {
                    if(role == 'supplier') {
                        supplierIndex = i;
                        if(party.hasOwnProperty('address') && party.address.hasOwnProperty('countryName')) supplierCountry = party.address.countryName;
                    }
                } );
            }
        } );

        if(supplierCountry) {
            let supplier = contract.parties[supplierIndex];
            switch(supplierCountry) {
                case "Costa Rica":
                    let score = 0;
                    if(supplier.address.hasOwnProperty('locality') && supplier.address.locality != '') score += 0.25;
                    if(supplier.address.hasOwnProperty('streetAddress') && supplier.address.streetAddress != '') score += 0.25;
                    if( supplier.address.hasOwnProperty('locality') && supplier.address.hasOwnProperty('streetAddress') ) {
                        if( (supplier.address.locality != supplier.address.streetAddress) && supplier.address.locality != '' && supplier.address.streetAddress != '')
                            score += 0.5
                    }
                    return score;
                default:
                    if(supplier.address.hasOwnProperty('streetAddress') && supplier.address.streetAddress != '') return 1;
                    break;
            }
        }
    }

    return 0;
}

module.exports = {
    direccionProveedor
};
