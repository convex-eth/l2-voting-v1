
# Convex L2 Voting Platform (v1)

Convex voting platform designed to run on an L2 for cheaper interactions.  This v1 is a first iteration which will contain some trusted aspects to it.  The final goal will be a v2 that is fully on chain and trustless.

## Notable Changes Over Previous System

### On Chain

Voting will be performed on-chain. This means that at the cost of spending gas for transactions, voting is verifiable and executable directly with contracts thus no web2 system that will bottle neck the voting process.  If a UI is unavailable, direct interaction is always a choice. On chain voting is also important to create a permissionless and trustless system, which will be the goal of a following v2 system.

### Surrogate system

We've added a new type of delegate, named Surrogate.  With delegation, the delegate votes on their own behalf and your voting power is applied automatically in the same way.
A surrogate however is an address that is designated to vote on your behalf.

Example: A multisig delegates to Votium. This allows the msig to at least get rewards if they are unable to sign for the given proposal.  The multisig ALSO designate an EOA address as a surrogate.  Now the multisig can cast votes more easily without having to gather all their signers.  The multisig can always overwrite the surrogate's vote with a normal transaction from the multisig itself. 

### Relock expired locks

In the previous voting system, user weighting is defined by the block at which the proposal starts.  This means that if a user has expired vlCVX locks, then those weights do not apply.
To circumvent this for gauge proposals, we used a voting weight for each user of the greater of last week and the current week.

With this new system, users will have their voting weight assigned from the start of the proposal. However if a user relocks an expired lock, they will now be able to send an on chain transaction on L1 which will bridge to L2 and update their voting weight for the given proposal.


### Add new eligible Gauges after proposal has started

Sometimes a new gauge may have been added to the Curve Gauge Controller just after a proposal has begun. Even though voting is still live and the gauge is eligible, because the old system is based on a specific block height the gauge could not be voted for.  Now gauges can be added to a gauge registry on L2 at any time, allowing voters to apply weight to newly added gauges.


## Proposal Process

### Creation

To create a new proposal, a merkle tree and proof will be generated and its root will be submitted to the voting contract, along with a start and finish time.

### User Vote and Weight

Users will start off each proposal with 0 "base weight".  When submitting their first vote, they will submit along with it a merkle proof of their vlCVX weight. The system will log this weight as their "base weight". Subsequent votes do not need to resubmit the merkle proof as the base weight is already registered.

If a user's locks are expired when the merkle is made, the user can relock and submit a transaction on mainnet to send a message to L2 to update the user's base weight.

Users will submit a vote on chain allocating a vote weight to any valid gauge. Weight for each gauge must be between 1 and 10,000 and the total sum of all weights must be equal to or less than 10,000.

### Gauge Registration

To vote for a gauge address, it must be registered as valid in the Gauge Registry residing on L2.  Adding a gauge is permissionless and can be done by sending a transaction on L1 using a CommitGauge contract to send a message cross chain to L2 to update the gauge registry.

A valid gauge must be on the Curve gauge controller with positive gauge weight and must have a is_killed flag that is false.

### Delegation

A user can delegate their voting power to another address using the current delegation contract on mainnet.

As part of the merkle generation, delegated power will be assigned to each delegate as part of their "adjusted weight".  To overwrite a delegate's vote, a user just needs to submit a normal vote themselves.  When a user who is delegating to another address votes, the "adjusted weight" on the delegate is changed to reflect the weight of the user. 

Ex. If User A has 1,000 vote weight is delegated to B.  User B will start with 1,000 adjusted weight.  When user A submits a vote(or supplies their merkle proof), user B will have -1,000 removed from their adjusted weight.

As mentioned above, a user may update their weight if there is discrepancy from the merkle proof. When this update is submitted on L2 and the user has a delegate, the delegate's "adjusted weight" will also be updated.

### Mainnet Result Submission

After the conclusion of the proposal, off chain scripts will compute the final vote outcome for each gauge and the Convex multsig will submit the transaction on mainnet.