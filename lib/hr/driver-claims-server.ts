import type {FinRecord,Viewer} from '../finance/model';
import {canAccess} from '../finance/access';
import {AppError,ForbiddenError} from '../shared/errors';
import {yearCaseRows} from '../accounts/server';
import {readAssetClaims} from './server';
import {damageIntakeReferencesForDriver} from '../ccr/damage-intake-server';
import {canViewDriverClaims,driverClaimReferences} from './driver-claims';

export async function personnelDriverClaims(viewer:Viewer,rawId:unknown,people:FinRecord[]){
 const id=typeof rawId==='string'&&/^[A-Za-z0-9:_-]{1,150}$/.test(rawId)?rawId:'';
 if(!id||!people.some(person=>person.kind==='person'&&person.id===id))throw new AppError('Personnel record not found.',404);
 if(!canViewDriverClaims(viewer,id,people))throw new ForbiddenError('Personnel claim references are not assigned to you for this person.');
 const [accounts,assets,imports]=await Promise.all([yearCaseRows(),readAssetClaims(),damageIntakeReferencesForDriver(id)]);
 return {personId:id,rows:driverClaimReferences(id,accounts,assets,imports,canAccess(viewer,'Compliance, Claims & Recovery','damage'))};
}
