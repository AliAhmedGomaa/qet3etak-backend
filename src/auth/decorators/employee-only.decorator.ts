import { Roles } from './roles.decorator';
import { EMPLOYEE_ROLE } from '../../common/enums/hr.enums';

/** Restrict route to authenticated employee-portal JWTs. */
export const EmployeeOnly = () => Roles(EMPLOYEE_ROLE);
