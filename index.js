#!/usr/bin/env node
const JSONStream = require('JSONStream');
const es = require('event-stream');
const { Client } = require('@elastic/elasticsearch');
const commandLineArgs = require('command-line-args');
const { evaluateFlags, evaluateNodeFlags } = require('./evaluator/evaluate');
const { parseFlags, getCriteriaObject, getPartyCriteriaObject } = require('./evaluator/parser');
const {
    createFlagCollectionObject,
    updateFlagCollection,
    getPartyCriteriaSummary,
    getPartyNodeSummary,
    getContractCriteriaSummary,
    // sendCollectionToDB
} = require('./evaluator/collection');
const { createOrgTree, updateOrgTree } = require('./evaluator/tree');

console.time('duration');

const optionDefinitions = [
    { name: 'mode', alias: 'm', type: String, defaultValue: 'contracts' },
    { name: 'database', alias: 'd', type: String },
    { name: 'collection', alias: 'c', type: String },
    { name: 'flags', alias: 'f', type: String }, // Name of file containing flag definitions (should always be placed in root folder)
    { name: 'test', alias: 't', type: String }, // Test with one ocid
    { name: 'limit', alias: 'l', type: Number }, // Test with n=limit contract_flags
    { name: 'size', alias: 's', type: Number, defaultValue: 100 } // Batch size
];
const args = commandLineArgs(optionDefinitions);

if(!args.flags) {
    console.log('ERROR: missing parameters.');
    process.exit(1);
}

// let seenRecords = 0;            // Counter for records read from DB
let seenContracts = 0;          // Counter for contracts extracted from records
// let sentContracts = 0;          // Counter for contracts sent to DB
let contractEvaluations = [];
// let contractPromises = [];
// let partyPromises = [];
const chunkSize = 1;                // How many documents will be sent to DB at once
const flags = parseFlags(args.flags);   // TODO: Add a syntax check to the flags definition. Should output warnings for rules with errors.
const flagCollectionObj = createFlagCollectionObject(flags.ruleset_id, flags.contract_rules);
const partyFlagCollection = [];
const flagCriteriaObj = getCriteriaObject(flags.contract_rules);

if(args.mode == 'contracts') {
    process.stdin.setEncoding('utf8');
    process.stdin
        .pipe(JSONStream.parse())
        .pipe(es.mapSync(function (doc) {
            let evals = evaluateFromStream(doc);
            evals.map( (e) => { process.stdout.write(JSON.stringify(e) + '\n') } )
        }))

    process.stdin.on('end', () => {
        process.stdout.write('\n');
        process.exit(0);
    });
}
else {
    connect(evaluateParties)
}

function evaluateParties(client) {
    let partyScores = {};
    let orgTree = createOrgTree();

    let query = {
        match_all: {}
    };
    if(args.test) { // Use the -t flag to test a single record by ocid
        query = { "match_phrase": { "parties.id.keyword": args.test } }
    }

    let batch_size = args.size;

    let hit_count = 0;

    getContractFlags(client, orgTree, query, batch_size, hit_count)
        .then( () => { // All contracts have been evaluated and processed, proceed to process all parties
            // console.log('Processing parties.');
            const arrayLength = Object.keys(partyFlagCollection).length; // How many parties have we seen?
            let contractCriteriaObj = getCriteriaObject(flags.contract_rules);
            let partyCriteriaObj = getCriteriaObject(flags.party_rules);
            let partyScoreCriteriaObj = getPartyCriteriaObject(flags.party_rules);

            // Calculate PARTY_FLAGS structure
            // Split into n=chunkSize chunks
            // Convert flagCollection structure to DB structure
            let parties = 0;
            let partyChunk = [];
            for(var partyID in partyFlagCollection) {
                parties++;
                partyChunk.push(partyFlagCollection[partyID]);
                delete partyFlagCollection[partyID];

                if(parties % chunkSize == 0 || parties >= arrayLength) {
                    let party_flags = getPartyCriteriaSummary(partyChunk, contractCriteriaObj);
                    party_flags.map( (party) => {
                        partyScores[party.party.id] = {
                            ruleset_id: party.ruleset_id,
                            party: party.party,
                            contract_categories: party.contract_score,
                            contract_rules: party.contract_rules,
                            years: party.years,
                            node_rules: JSON.parse(JSON.stringify(partyScoreCriteriaObj)),
                            node_categories: JSON.parse(JSON.stringify(partyCriteriaObj)),
                            category_score: {},
                            num_parties: 0,
                            total_score: 0
                        };
                        // console.log("parties partyScores",partyScores[party.party.id])
                    } );
                    partyChunk = [];
                }
            }

            // console.log('Evaluating node flags.');
            let nodeScores = evaluateNodeFlags(orgTree, partyScores, flags.party_rules);
            // console.log('Node flags done.');

            // Stream out party flags:
            // - Split into n=chunkSize chunks
            // - Process & output chunks
            parties = 0;
            partyChunk = [];
            for(var partyID in partyScores) {
                parties++;
                partyChunk.push(partyScores[partyID]);

                if(parties % chunkSize == 0 || parties >= arrayLength) {
                    let party_flags = getPartyNodeSummary(partyChunk, nodeScores);

                    party_flags.map(party_flag => {
                        console.log(JSON.stringify(party_flag));
                    })

                    partyChunk = [];
                }
            }
            // console.log('Seen parties:', parties);

        } )
        .then( () => {
            // console.timeEnd('duration');
            process.exit(0); // All done!
        } ).
        catch( (err) => { console.log('Error:', err); process.exit(1); } );
}


//We get contract_flags from elastic here - we should use a scroll to get all of them
async function getContractFlags(client,orgTree,query,batch_size,hit_count) {

    const params = {
        index: args.collection || 'contract_flags',
        scroll: '30s',
        size: batch_size,
        body: {
            query: query
        }
    }

    const scrollSearch = client.helpers.scrollSearch(params)

    // console.log('Scrolling contract_flags from elastic...',params);

    // if (args.limit)
    //     console.log("Scrolling limited to",args.limit,"hits");
    // else
    //     console.log("Scrolling without limit, this will process all hits (long)");

    for await (const response of scrollSearch) {
        if (hit_count >= args.limit) {
            // console.log("Reached hit limit",args.limit);
            response.clear()
            break
        }

        for (hit of response.body.hits.hits) {
            hit_count++;
            if (args.limit) {
                // console.log("hit",hit_count,args.limit|"");
            }
            if (hit_count >= args.limit) {
                // console.log("Reached hit limit",args.limit);
                break
            }

            evaluation = hit._source;

            evaluation.parties.map( (party) => { // Assign contractScore values to all the parties involved
                updateFlagCollection(party, partyFlagCollection, evaluation);
            } );

            // AQUI BANDERAS NODO Y CONFIABILIDAD
            updateOrgTree(orgTree, evaluation, evaluation.parties, flags.party_rules);
        }

        //Todo: Clear scroll
        if (1==2) {
            response.clear();
        }
    }
    // console.log(JSON.stringify(orgTree, null, 4));
}



function connect(callback) {
    const elasticNode = args.database || 'http://localhost:9200/';
    //We are using self-signed certificaes for elastic
    const client = new Client({ node: elasticNode, ssl: { rejectUnauthorized: false }, resurrectStrategy: "none", compression: "gzip" });

    function elastic_test(retry=0) {
      // console.log("Testing elastic connnection",retry)

      //Simple test query
      client.xpack.usage().then(
        () => {
          // console.log("Connected to elastic node:",elasticNode);
          callback(client)
        }
      ).catch(e => {
        if (retry < 3) {
          console.log("Retry elastic");
          setTimeout(() => {

            elastic_test(retry+1)
          },5000*(retry+1))
        }
        else {

          console.error("Error connecting to elastic node:",elasticNode,e);
          if (e.meta && e.meta.body && e.meta.body.error) {
            console.error("Error body", e.meta.body.error);
          }
          process.exit(100);
        }
      })
    }

    elastic_test();
}



function isValidContract(contract) {
    return contract.hasOwnProperty('parties') && contract.hasOwnProperty('contracts');
}

function evaluateFromStream(record) {
    let contractEval = null;
    // Check if we are working with records or releases
    if( record.hasOwnProperty('compiledRelease') )
        contract = record.compiledRelease;
    else contract = record;

    if( isValidContract(contract) ) {
        evaluations = evaluateFlags(record, contract, flags.contract_rules, flags.party_fields, flagCollectionObj); // Perform evaluation of the document
        seenContracts += evaluations.length;

        contractEval = getContractCriteriaSummary(evaluations, flagCriteriaObj, flagCollectionObj.ruleset_id);
    }
    return contractEval;
}
