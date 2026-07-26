import { Roles } from './roles.decorator';
import { DELIVERY_ROLE } from '../../common/enums/delivery.enums';

/** Restrict route to authenticated delivery-portal JWTs. */
export const DeliveryOnly = () => Roles(DELIVERY_ROLE);
