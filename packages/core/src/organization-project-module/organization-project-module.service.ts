import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Brackets, FindManyOptions, SelectQueryBuilder, WhereExpressionBuilder } from 'typeorm';
import {
	ID,
	IOrganizationProjectModule,
	IOrganizationProjectModuleFindInput,
	IPagination,
	PermissionsEnum,
	TaskStatusEnum
} from '@gauzy/contracts';
import { isEmpty, isNotEmpty } from '@gauzy/common';
import { isPostgres } from '@gauzy/config';
import { PaginationParams, TenantAwareCrudService } from './../core/crud';
import { RequestContext } from '../core/context';
import { OrganizationProjectModule } from './organization-project-module.entity';
import { prepareSQLQuery as p } from './../database/database.helper';
import { TypeOrmOrganizationProjectModuleRepository } from './repository/type-orm-organization-project-module.repository';
import { MikroOrmOrganizationProjectModuleRepository } from './repository/mikro-orm-organization-project-module.repository';

@Injectable()
export class OrganizationProjectModuleService extends TenantAwareCrudService<OrganizationProjectModule> {
	constructor(
		readonly typeOrmProjectModuleRepository: TypeOrmOrganizationProjectModuleRepository,
		readonly mikroOrmProjectModuleRepository: MikroOrmOrganizationProjectModuleRepository
	) {
		super(typeOrmProjectModuleRepository, mikroOrmProjectModuleRepository);
	}

	/**
	 * @description Find employee project modules
	 * @param options - Options finders and relations
	 * @returns - A promise that resolves after found project modules
	 * @memberof OrganizationProjectModuleService
	 */
	async getEmployeeProjectModules(
		options: PaginationParams<OrganizationProjectModule>
	): Promise<IPagination<IOrganizationProjectModule>> {
		try {
			const { where } = options;
			const { name, status, organizationId, projectId, members } = where;
			const tenantId = RequestContext.currentTenantId() || options.where.tenantId;

			// Create query builder
			const query = this.typeOrmRepository.createQueryBuilder(this.tableName);
			// Join employees
			query.innerJoin(`${query.alias}.members`, 'members');

			// Apply pagination and query options
			this.applyPaginationAndOptions(query, options);

			query.andWhere((qb: SelectQueryBuilder<OrganizationProjectModule>) => {
				const subQuery = qb.subQuery();
				subQuery
					.select(p('"project_module_employee"."organizationProjectModuleId"'))
					.from(p('project_module_employee'), p('project_module_employee'));

				// If user have permission to change employee
				if (RequestContext.hasPermission(PermissionsEnum.CHANGE_SELECTED_EMPLOYEE)) {
					if (isNotEmpty(members) && isNotEmpty(members['id'])) {
						const employeeId = members['id'];
						subQuery.andWhere(p('"project_module_employee"."employeeId" = :employeeId'), { employeeId });
					}
				} else {
					// If employee has login and don't have permission to change employee
					const employeeId = RequestContext.currentEmployeeId();
					if (isNotEmpty(employeeId)) {
						subQuery.andWhere(p('"project_module_employee"."employeeId" = :employeeId'), { employeeId });
					}
				}
				return (
					p('"organization_project_module_members"."organizationProjectModuleId" IN ') +
					subQuery.distinct(true).getQuery()
				);
			});
			query.andWhere(
				new Brackets((qb: WhereExpressionBuilder) => {
					qb.andWhere(p(`"${query.alias}"."organizationId" = :organizationId`), { organizationId });
					qb.andWhere(p(`"${query.alias}"."tenantId" = :tenantId`), { tenantId });
				})
			);
			query.andWhere(
				new Brackets((qb: WhereExpressionBuilder) => {
					// Apply optional filters
					const filters: IOrganizationProjectModuleFindInput = {
						status: status as TaskStatusEnum,
						projectId: projectId as ID,
						name: name as string
					};

					// Apply optional filters
					this.applyOptionalFilters(query, qb, filters);
				})
			);

			console.log('Get Employees modules', query.getSql()); // Query logs for debugging

			// Execute the query with pagination
			return await this.executePaginationQuery<OrganizationProjectModule>(query);
		} catch (error) {
			// Error logging for debugging
			throw new HttpException(
				`Error while retrieving employee project modules: ${error.message}`,
				HttpStatus.BAD_REQUEST
			);
		}
	}

	/**
	 * @description Find Team's project modules
	 * @param options - Options finders and relations
	 * @returns - A promise that resolves after found project modules
	 * @memberof OrganizationProjectModuleService
	 */
	async findTeamProjectModules(
		options: PaginationParams<OrganizationProjectModule>
	): Promise<IPagination<IOrganizationProjectModule>> {
		try {
			const { where } = options;
			const { name, status, teams = [], organizationId, projectId, members } = where;
			const tenantId = RequestContext.currentTenantId() || where.tenantId;

			// Create query builder
			const query = this.typeOrmRepository.createQueryBuilder(this.tableName);

			// Join teams
			query.leftJoin(`${query.alias}.teams`, 'teams');

			// Apply pagination and query options
			this.applyPaginationAndOptions(query, options);

			query.andWhere((qb: SelectQueryBuilder<OrganizationProjectModule>) => {
				const subQuery = qb.subQuery();
				subQuery
					.select(p('"project_module_team"."organizationProjectModuleId"'))
					.from(p('project_module_team'), p('project_module_team'));
				subQuery.leftJoin(
					'organization_team_employee',
					'organization_team_employee',
					p('"organization_team_employee"."organizationTeamId" = "project_module_team"."organizationTeamId"')
				);
				// If user have permission to change employee
				if (RequestContext.hasPermission(PermissionsEnum.CHANGE_SELECTED_EMPLOYEE)) {
					if (isNotEmpty(members) && isNotEmpty(members['id'])) {
						const employeeId = members['id'];
						subQuery.andWhere(p('"organization_team_employee"."employeeId" = :employeeId'), { employeeId });
					}
				} else {
					// If employee has login and don't have permission to change employee
					const employeeId = RequestContext.currentEmployeeId();
					if (isNotEmpty(employeeId)) {
						subQuery.andWhere(p('"organization_team_employee"."employeeId" = :employeeId'), { employeeId });
					}
				}
				if (isNotEmpty(teams)) {
					subQuery.andWhere(p(`"${subQuery.alias}"."organizationTeamId" IN (:...teams)`), { teams });
				}
				return (
					p(`"organization_project_module_members"."organizationProjectModuleId" IN `) +
					subQuery.distinct(true).getQuery()
				);
			});
			query.andWhere(
				new Brackets((qb: WhereExpressionBuilder) => {
					qb.andWhere(p(`"${query.alias}"."organizationId" = :organizationId`), { organizationId });
					qb.andWhere(p(`"${query.alias}"."tenantId" = :tenantId`), { tenantId });
				})
			);
			if (isNotEmpty(projectId) && isNotEmpty(teams)) {
				query.orWhere(p(`"${query.alias}"."projectId" = :projectId`), { projectId });
			}
			query.andWhere(
				new Brackets((qb: WhereExpressionBuilder) => {
					if (isNotEmpty(projectId) && isEmpty(teams)) {
						qb.andWhere(p(`"${query.alias}"."projectId" = :projectId`), { projectId });
					}

					// Apply optional filters
					const filters: IOrganizationProjectModuleFindInput = {
						status: status as TaskStatusEnum,
						name: name as string
					};

					// Apply optional filters
					this.applyOptionalFilters(query, qb, filters);
				})
			);

			console.log('Get Employees modules', query.getSql()); // Query logs for debugging

			// Execute the query with pagination
			return await this.executePaginationQuery<OrganizationProjectModule>(query);
		} catch (error) {
			// Error logging for debugging
			throw new HttpException(
				`Error while retrieving organization team project modules: ${error.message}`,
				HttpStatus.BAD_REQUEST
			);
		}
	}

	/**
	 * @description Find project modules by employee
	 * @param employeeId - The employee ID for whom to search project modules
	 * @param options - Finders options
	 * @returns A promise that resolves after found project modules
	 * @memberof OrganizationProjectModuleService
	 */
	async findByEmployee(
		employeeId: ID,
		options: IOrganizationProjectModuleFindInput
	): Promise<IPagination<IOrganizationProjectModule>> {
		try {
			const tenantId = RequestContext.currentTenantId() || options?.tenantId;
			const organizationId = options?.organizationId;

			// Create query builder
			const query = this.typeOrmRepository.createQueryBuilder(this.tableName);

			// Joins and where clauses
			query.innerJoin(`${query.alias}.members`, 'member');
			query.leftJoin(`${query.alias}.teams`, 'project_team');
			query.leftJoin(`${query.alias}."organizationSprints"`, 'sprint');

			query.andWhere(
				new Brackets((qb: WhereExpressionBuilder) => {
					qb.andWhere(p('member.id = :employeeId'), { employeeId })
						.andWhere(p(`"${query.alias}"."tenantId" = :tenantId`), { tenantId })
						.andWhere(p(`"${query.alias}"."organizationId" = :organizationId`), { organizationId });

					// Apply optional filters
					this.applyOptionalFilters(query, qb, options);
				})
			);

			// Execute the query with pagination
			return await this.executePaginationQuery<OrganizationProjectModule>(query);
		} catch (error) {
			// Error logging for debugging
			throw new HttpException(
				`Error while retrieving organization project modules by employee: ${error.message}`,
				HttpStatus.BAD_REQUEST
			);
		}
	}

	/**
	 * Apply pagination and query options
	 *
	 * @param query - The query builder to apply pagination and options
	 * @param options - Pagination and query options
	 */
	private applyPaginationAndOptions(
		query: SelectQueryBuilder<OrganizationProjectModule>,
		params: PaginationParams<OrganizationProjectModule>
	) {
		if (isNotEmpty(params)) {
			const options: FindManyOptions<OrganizationProjectModule> = {};

			if ('skip' in params) {
				options.skip = (params.take || 10) * (params.skip - 1);
				options.take = params.take || 10;
			}

			if (params.select) {
				options.select = params.select;
			}

			if (params.relations) {
				options.relations = params.relations;
			}

			if (params.order) {
				options.order = params.order;
			}

			// Apply pagination and query options
			query.setFindOptions(options);
		}
	}

	/**'
	 * Apply optional filters to the query builder
	 */
	private applyOptionalFilters(
		query: SelectQueryBuilder<OrganizationProjectModule>,
		qb: WhereExpressionBuilder,
		options: IOrganizationProjectModuleFindInput
	) {
		const { projectId, status, name, organizationSprintId, organizationTeamId } = options;

		if (isNotEmpty(projectId)) {
			qb.andWhere(p(`"${query.alias}"."projectId" = :projectId`), { projectId });
		}

		if (isNotEmpty(status)) {
			qb.andWhere(p(`"${query.alias}"."status" = :status`), { status });
		}

		if (isNotEmpty(name)) {
			const like = isPostgres() ? 'ILIKE' : 'LIKE';
			qb.andWhere(p(`"${query.alias}"."name" ${like} :name`), { name: `%${name}%` });
		}

		if (isNotEmpty(organizationSprintId)) {
			qb.andWhere('sprint.id = :organizationSprintId', { organizationSprintId });
		}

		if (isNotEmpty(organizationTeamId)) {
			qb.andWhere('project_team.id = :organizationTeamId', { organizationTeamId });
		}
	}

	/**
	 * Executes the given query with pagination and returns the results.
	 *
	 * @param query The query builder instance to execute.
	 * @returns A promise that resolves to an object containing the paginated items and total count.
	 */
	async executePaginationQuery<BaseType>(query: SelectQueryBuilder<BaseType>): Promise<IPagination<BaseType>> {
		const [items, total] = await query.getManyAndCount();
		return { items, total };
	}
}
