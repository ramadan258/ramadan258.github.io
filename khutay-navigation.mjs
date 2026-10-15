// Old goal URLs resolve to the daily view; only the approved tabs are enabled.
export const plannerFeatures=Object.freeze({goals:false});
export const plannerTabs=Object.freeze(['day','habits',...(plannerFeatures.goals?['goals']:[]),'harvest']);
export const resolvePlannerTab=name=>plannerTabs.includes(name)?name:'day';
export function nextPlannerTab(name,key){
  const index=plannerTabs.indexOf(resolvePlannerTab(name)),count=plannerTabs.length;
  return key==='ArrowLeft'?plannerTabs[(index+1)%count]:key==='ArrowRight'?plannerTabs[(index+count-1)%count]:key==='Home'?plannerTabs[0]:key==='End'?plannerTabs.at(-1):null;
}
