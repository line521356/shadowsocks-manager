const log4js = require('log4js');
const logger = log4js.getLogger('flowSaver');
const knex = appRequire('init/knex').knex;
const moment = require('moment');
const cron = appRequire('init/cron');

const generateFlow = async (type) => {
  try {
    let tableName;
    let interval;
    if(type === 'day') {
      tableName = 'saveFlowDay';
      interval = 24 * 3600 * 1000;
    }
    if(type === 'hour') {
      tableName = 'saveFlowHour';
      interval = 3600 * 1000;
    }
    if(type === '5min') {
      tableName = 'saveFlow5min';
      interval = 5 * 60 * 1000;
    }
    const count = await knex('saveFlow').count('id as count').then(success => success[0].count);
    if(!count) { return; }
    const recent = await knex(tableName).select().orderBy('time', 'DESC').limit(1).then(success => success[0]);
    let time;
    if(!recent) {
      const firstFlow = await knex('saveFlow').select().orderBy('time', 'ASC').limit(1).then(success => success[0]);
      if(type === 'day') {
        time = moment(firstFlow.time).hour(0).minute(0).second(0).millisecond(0).toDate().getTime();
      }
      if(type === 'hour') {
        time = moment(firstFlow.time).minute(0).second(0).millisecond(0).toDate().getTime();
      }
      if(type === '5min') {
        const minute = moment(firstFlow.time).minute();
        time = moment(firstFlow.time).minute(minute - minute % 5).second(0).millisecond(0).toDate().getTime();
      }
    } else {
      time = recent.time + interval;
    }
    if(Date.now() - time < interval) {
      return;
    }
    let sum = await knex('saveFlow')
    .sum('flow as sumFlow')
    .groupBy(['port', 'id'])
    .select(['saveFlow.port as port'])
    .select(['saveFlow.id as id'])
    .whereBetween('time', [time, time + interval]);
    if(!sum.length) { sum = [{id: 0, port: 0, flow: 0}]; }
    logger.info(`Generate ${ type } flow, length: ${ sum.length }`);
    await knex(tableName).insert(sum.map(m => {
      return {
        id: m.id,
        port: m.port,
        flow: m.sumFlow,
        time,
      };
    }));
    await knex(tableName).delete().where({
      id: 0,
    }).whereBetween('time', [0, time - 1]); 
  } catch (err) {
    logger.error(err);
  }
  await generateFlow(type);
};

// generateFlow('day');
// generateFlow('hour');
// generateFlow('5min');

cron.minute(() => {
  // generateFlow('day');
  // generateFlow('hour');
  knex('saveFlow').delete().whereBetween('time', [0, Date.now() - 36 * 3600 * 1000]).then();
  knex('saveFlowDay').delete().whereBetween('time', [0, Date.now() - 35 * 24 * 3600 * 1000]).then();
  knex('saveFlowHour').delete().whereBetween('time', [0, Date.now() - 7 * 24 * 3600 * 1000]).then();
  knex('saveFlow5min').delete().whereBetween('time', [0, Date.now() - 3 * 24 * 3600 * 1000]).then();
}, 37);
cron.minute(() => {
  generateFlow('5min');
}, 5);
cron.cron(() => {
  generateFlow('hour');
}, '1 * * * *');
cron.cron(() => {
  generateFlow('day');
}, '1 0 * * *');