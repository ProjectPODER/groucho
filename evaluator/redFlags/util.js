function isEmpty(obj) {
    for(var key in obj) {
        if(obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

function isObject(val) {
    if (val === null) { return false;}
    return ( (typeof val === 'function') || (typeof val === 'object') );
}

function isArray(obj) {
    return !!obj && obj.constructor === Array;
}

function isString(x) {
    return Object.prototype.toString.call(x) === "[object String]"
}

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function isDate(d) {
    return typeof d.toISOString === "function";
}

// Parameters:
//      field: name of the field as a string separated by "."
//      tempObj: the object in which the fields should be found
// Return:
//      Array: the contents of the field, or empty array if the field was not found
function fieldPathExists(field, tempObj) {
    var fieldValues = [];
    var fieldPath = field.split('.');

    // Iterate over array with the components of the field
    for(var i=0; i<fieldPath.length; i++) {
        // Field does NOT exist in object
        if( typeof tempObj[fieldPath[i]] == 'undefined' ) {
            return fieldValues;
        }
        // Field has a value of null
        if(tempObj[fieldPath[i]] == null) {
            return fieldValues;
        }

        if( isArray(tempObj[fieldPath[i]]) ) { // Field is an array
            if(i == fieldPath.length - 1) { // Estamos chequeando si existe el array, no su valor
                fieldValues.push(tempObj[fieldPath[i]]);
            }
            else if( tempObj[fieldPath[i]].length > 0 ) { // Iteramos sobre el array de campos
                tempObj[fieldPath[i]].map( (tempItem) => {
                    var results = fieldPathExists( fieldPath.slice(i+1, fieldPath.length).join('.'), tempItem );
                    fieldValues = fieldValues.concat(results);
                } );
            }
            return fieldValues;
        }
        else if( isString(tempObj[fieldPath[i]]) || isNumeric(tempObj[fieldPath[i]]) ) { // Value of the field is a string or number
            if(i < fieldPath.length - 1) { // Arrived at a string or number while end of path has not been reached
                return fieldValues;
            }
            if(!isNumeric(tempObj[fieldPath[i]]) && (tempObj[fieldPath[i]] == '' || tempObj[fieldPath[i]] == '---' || tempObj[fieldPath[i]] == 'null')) { // Arrived at empty string, '---' or 'null'
                return fieldValues;
            }
            fieldValues.push( tempObj[fieldPath[i]] );
            return fieldValues;
        }
        else if( isDate(tempObj[fieldPath[i]]) ) { // Value of the field is a date
            if(i < fieldPath.length - 1) { // Arrived at a date while end of path has not been reached
                return fieldValues;
            }
            fieldValues.push(tempObj[fieldPath[i]].toISOString());
            return fieldValues;
        }
        else if( tempObj.hasOwnProperty(fieldPath[i]) && !isEmpty(tempObj[fieldPath[i]]) ) { // fieldPath[i] is an object
            tempObj = tempObj[fieldPath[i]];
        }
        else { // None of the above...
            fieldValues.push(tempObj[fieldPath[i]]);
            return fieldValues;
        }
    }

    fieldValues.push(tempObj);
    return fieldValues;
}

function makeUnique(arr){
    var uniqueArray=[];
    for(var i=0; i<arr.length; i++){
        if( !uniqueArray.includes(arr[i]) ){
            uniqueArray.push(arr[i]);
        }
    }
    return uniqueArray;
}

function evaluateConditions(contract, conditions, fieldName) {
    var fieldExists = [];

    Object.keys(conditions).map( (condition, index) => {
        switch(condition) {
            case 'or': // Check if any of the fields exists
                var or = conditions[condition].filter( (item) => {
                    var fieldvalue = fieldPathExists(item, contract);
                    return (fieldvalue.length > 0)? true : false;
                } );

                if(or.length > 0) { // Check the conditions inside the OR
                    fieldExists = fieldExists.concat(fieldPathExists(fieldName, contract));
                }
            default:
                var conditionField = Object.keys(conditions)[0];
                var conditionValue = conditions[conditionField];
                var foundValue = fieldPathExists( conditionField, contract );

                if(foundValue.length > 0) { // There is at least one result for the field in the condition
                    foundValue.map( (result) => {
                        // Commpare results obtained with expected value of the condition
                        if(result == conditionValue) {
                            fieldExists = fieldExists.concat( fieldPathExists(fieldName, contract) );
                        }
                    } );
                }
        }
    } );

    return (fieldExists.length > 0)? true : false;
}

function evaluateDateCondition(contract, conditionType, condition, daysDifference) {
    var conditionMatches = false;

    Object.keys(condition.conditions).map( (field) => {
        var fieldValue = fieldPathExists(field, contract);
        if(fieldValue.length > 0) {
            fieldValue.map( (value) => {
                if(isString(condition.conditions[field])) {
                    if(condition.conditions[field] == value) {
                        switch(conditionType) {
                            case 'maximum':
                                if(daysDifference < condition.value) conditionMatches = true;
                                break;
                            case 'minimum':
                                if(daysDifference > condition.value) conditionMatches = true;
                                break;
                        }
                    }
                }
                else { // There is an OR
                    condition.conditions[field].or.map( (orValue) => {
                        if(orValue == value) {
                            switch(conditionType) {
                                case 'maximum':
                                    if(daysDifference < condition.value) conditionMatches = true;
                                    break;
                                case 'minimum':
                                    if(daysDifference > condition.value) conditionMatches = true;
                                    break;
                            }

                        }
                    } );
                }
            } );
        }
    } );

    return conditionMatches;
}

module.exports = {
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
};
