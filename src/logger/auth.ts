import { NextFunction, request, Request, RequestHandler, Response } from 'express';
import { ObjectId } from 'mongodb';
import { verify } from 'jsonwebtoken';
import { of, throwError } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { User } from '../models/user';
import { publicKey } from '../config/keys';
import { Permission, Role } from './../models/permission';
import { MissionsDAL } from '../dal/missions';
import { UserWithPermission, UserWithRole } from '../models/user';
import { ForbiddenError, InvalidTokenError, MissingTokenError, NotFoundError } from './error';
import { Mission } from '../models/mission';
import { GroupsDAL } from '../dal/groups';
import { Group } from '../models/group';


export function authentication(): RequestHandler {

	return (request: Request, response: Response, next: NextFunction) => {
		const token: string = request.cookies.token;
		if (!token) return next(new MissingTokenError());

		try {
			const { _id, name, hierarchy }: User = verify(token, publicKey, { algorithms: ['RS512'] }) as User;
			response.locals.currentUser = { _id, name, hierarchy };
		} catch (error: any) {
			return next(new InvalidTokenError(error));
		}
		next();
	}
}

export function setDALs(missions: MissionsDAL, groups: GroupsDAL): RequestHandler {
	return (request: Request, response: Response, next: NextFunction) => {
		response.locals.dals = { missions, groups };
		next();
	}
}

export function authorization(desiredPermission: Permission): RequestHandler {
	return (request: Request, response: Response, next: NextFunction) => {
		const missionId: string = request.params.id;
		const currentUser: User = response.locals.currentUser;

		const missionsDAL: MissionsDAL = response.locals.dals.missions;
		missionsDAL.getMissionById(new ObjectId(missionId)).pipe(
			switchMap((mission: Mission) => {
				if (!mission) return throwError(new NotFoundError(`mission with id: ${missionId}`))

				const userInMission: UserWithPermission = mission.users.find((user: UserWithPermission) => user._id === currentUser._id);
				if (!userInMission) return throwError(new NotFoundError(`user '${currentUser._id}' in mission '${missionId}'`));

				return of(userInMission.permission)
			})
		).subscribe({
			next: (permission: Permission) => {
				if (permission < desiredPermission) return next(new ForbiddenError(getMethodName(request), Permission[permission], Permission[desiredPermission]));
				return next();
			},
			error: (error: any) => next(error)
		});
	}
}

export function gauthorization(desiredRole: Role): RequestHandler {
	return (request: Request, response: Response, next: NextFunction) => {
		const groupId: string = request.params.id;
		const currentUser: User = response.locals.currentUser;

		const groupsDal: GroupsDAL = response.locals.dals.groups;
		groupsDal.getGroupById(new ObjectId(groupId)).pipe(
			switchMap((group: Group) => {
				if (!group) return throwError(new NotFoundError(`group with id: ${group}`))

				const userInGroup: UserWithRole = group.users.find((user: UserWithRole) => user._id === currentUser._id);
				if (!userInGroup) return throwError(new NotFoundError(`user '${currentUser._id}' in groups '${groupId}'`));

				return of(userInGroup.role)
			})
		).subscribe({
			next: (role: Role) => {
				if (role < desiredRole) return next(new ForbiddenError(getMethodName(request) ,Role[role], Role[desiredRole]));
				return next();
			},
			error: (error: any) => next(error)
		});
	}
}

function getMethodName(request: Request): string{
	return request.route.path.split('/')[1];
}