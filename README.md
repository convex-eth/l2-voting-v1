
# Convex L2 Voting Platform (v1)

Convex voting platform designed to run on an L2 for cheaper interactions.  This v1 is a first iteration which will contain some trusted aspects to it.  The final goal will be a v2 that is fully on chain.


## Proposal Process

### Creation

To create a new proposal, a merkle tree and proof will be generated and its root will be submitted to the voting contract, along with a start and finish time.

### User Vote and Weight

Users will start off each proposal with 0 "base weight".  When submitting their first vote, they will submit along with it a merkle proof of their vlCVX weight. The system will log this weight as their "base weight". Subsequent votes do not need to resubmit the merkle proof as the base weight is already registered.

If a user's locks are expired when the merkle is made, the user can relock and submit a transaction on mainnet to send a message to L2 to update the user's weight.  The difference of the new and old will be written to an "adjusted weight" property for the user.

Users will submit a vote on chain allocating a vote weight to any gauge.

### Delegation

A user can delegate their voting power to another address using an L2 transaction, or continue to use their current mainnet delegation. (todo: L1 superceeds?)

As part of the merkle generation, delegated power will be assigned to each delegate as part of their "base weight".  To overwrite a delegate's vote, a user just needs to submit a normal vote themselves.  When a user who is delegating to another address votes, the "adjusted weight" on the delegate is changed to reflect the weight of the user. 

Ex. If User A has 1,000 vote weight is delegated to B.  User B will start with 1,000 base weight and 0 adjusted weight.  When user A submits a vote(and thus registers a base weight), user B will have -1,000 attributed to their adjusted weight.

As mentioned above, a user may update their weight if there is discrepancy from the merkle proof. When this update is submitted on L2 and the user has a delegate, the delegate's "adjusted weight" will also be updated.

### Mainnet Submission

After the conclusion of the proposal, off chain scripts will compute the final vote outcome for each gauge and the Convex multsig will submit the transaction on mainnet.