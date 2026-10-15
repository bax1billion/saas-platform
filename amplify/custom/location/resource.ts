import { Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';

/**
 * Amazon Location Service grants for the platform's maps (`lib/map/`):
 * street, hybrid and satellite basemaps from the Maps API and address
 * search from the Places API. Both are the current "standalone" APIs: they
 * take no per-environment map or place-index resource (the earlier
 * resource-based APIs did, one set per sandbox, on a data provider whose
 * terms forbid locating or tracking vehicles and crews), so the construct
 * holds only IAM. Requests are signed with the signed-in user's own
 * Identity Pool credentials (`lib/map/location.ts`); the one public,
 * referer-restricted API key for pages opened with no account is made in
 * `amplify/backend.ts` beside this.
 *
 * The provider ARN is the same in every account:
 * `arn:aws:geo-maps:<region>::provider/default` (and `geo-places`).
 */
export interface MapServicesProps {
  /**
   * Every IAM role a signed-in user might assume. Amplify's `groups`
   * config (amplify/auth/resource.ts) gives each Cognito group its own
   * Identity Pool role: a user in a group assumes *that* role, not the
   * base authenticated role, so granting only the latter leaves grouped
   * users (Admin, Member, Viewer) unauthorized. Never Operator.
   */
  roles: iam.IRole[];
}

export interface MapServicesOutput {
  region: string;
}

/** The Maps API's provider resource in this stack's region. */
export const mapsProviderArn = (stack: Stack) =>
  stack.formatArn({ service: 'geo-maps', account: '', resource: 'provider', resourceName: 'default' });

/** The Places API's provider resource in this stack's region. */
export const placesProviderArn = (stack: Stack) =>
  stack.formatArn({ service: 'geo-places', account: '', resource: 'provider', resourceName: 'default' });

/** What the signed-in map needs: tiles and the style's parts. */
export const MAP_TILE_ACTIONS = [
  'geo-maps:GetTile',
  'geo-maps:GetStyleDescriptor',
  'geo-maps:GetGlyphs',
  'geo-maps:GetSprites',
] as const;

/** What the address search box calls: type-ahead, then the pick. */
export const PLACES_SEARCH_ACTIONS = ['geo-places:Suggest', 'geo-places:SearchText'] as const;

export function createMapServices(stack: Stack, props: MapServicesProps): MapServicesOutput {
  for (const role of props.roles) {
    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'MapTiles',
        actions: [...MAP_TILE_ACTIONS],
        resources: [mapsProviderArn(stack)],
      })
    );
    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'PlacesSearch',
        actions: [...PLACES_SEARCH_ACTIONS],
        resources: [placesProviderArn(stack)],
      })
    );
  }

  return { region: stack.region };
}
