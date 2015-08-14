<?php
define('apikey', '586229bd-69d8-4be3-accf-701a8346822c');
require('../mysql.php');
require('../php-lol-api-master/lol.api.php');

$api = new LeagueOfLegends(apikey, 'euw');

$params = array('champData' => 'info');

$result = $api->getStaticData('champion', $params);

$db = new Database();
$status = $db->updateChampions($result);

if($status)
    echo 200;
else
    echo 500;
?>