# Collision Manager

`CollisionManager` centralizes collisions and overlaps between game objects and the world's solid layers. Each registration method defines interaction specific to object type. It tracks registration handles for later cleanup.

[Source: CollisionManager.ts](/src/game/systems/collision/CollisionManager.ts)

## World Bounds

world-bound behaviour is handled by the objecs themselves.
- `Player` and `Foe` objects allow `setColliderWorldBounds()` in their constructors.
- `Projectiles` can leave the world bounds, and their `hasLeftTheWorld()` determines when object should get destroyed.

## Registering Interactions

Each object type has dedicated registration method in `CollisionManager`. `GameScene` spawns foes and projectiles, and then passes each instance to corresponding function.

Register player first using `setPlayer()`, because other object registrations depend on player.

Foe-related colliders include:
- **Contact Damage**: An overlap check between player and foe applies foe's `ContactDamage` - (`ContactDamage = 0` for foes without overlap damage).
- **Physical Blocking**: A simple collider between player and foe prevents them for passing through each other.
- **Meele Attacks**: Hit detection checks swing's overlap against it's targets.
- **Ranged Attacks**: Projectiles overlap with the player and collide with solid layers. Either interaction disposes the projectile.

## Adding a New Collision/Overlap

### Existing Object Type
- Find object type's corresponding registration method in `CollisionManager`
- Add desired colliders/overlap
- Pass collider handle to the private `track()` method so it can be cleaned up by destructor.

### New Object Type
- Add a new registration method to `CollisionManager`. Follow the naming pattern: `addExample(example: Example): Example`.
- Define the object's interactions with other objects, or solid layers.
- Create the required collider and overlap checks.
- Pass each collider handle in private `track()` for later destructor cleanup.
- Return registered instance
- Call the registration method after creating the object in `GameScene`

## Ownership and Cleanup

`CollisionManager` manages relationships and interactions between objects such as aplyer-foe, projectile-world, player-zone, etc.

The private `track()` method stores collider/overlap handles for later cleanup. Pass every handle created by the manager ot this method.

The constructor registers one-time event listener for scene's `SHUTDOWN` event. Listener calls `destroy()` to cleanup the manager's tracked colliders when scene shutdowns.
