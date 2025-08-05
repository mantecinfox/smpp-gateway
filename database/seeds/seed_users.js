exports.seed = function(knex) {
  return knex('users').del()
    .then(function () {
      return knex('users').insert([
        { name: 'Admin', email: 'admin@example.com' }
      ]);
    });
};
